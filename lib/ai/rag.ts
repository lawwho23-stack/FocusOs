import { createHash } from "node:crypto";
import { getRedis } from "@/lib/redis";
import { addDays } from "@/lib/day";
import { loadDays, type DayData } from "@/lib/day-stats";
import { dayView } from "@/lib/coach";
import { embed, toBlob } from "@/lib/ai/embed";
import { ensureIndex, SCHEMA_FIELD_TYPE } from "@/lib/ai/vectors";

// Knowledge (RAG = retrieval-augmented generation): Laww's whole history,
// one searchable text per day, so the coach can recall days older than
// the 7 it is always shown.
//
// Postgres stays the source of truth. Redis only holds a copy of each day
// as text + vector, keyed focusos:day:<date>. A day is re-embedded only
// when its text changes (the stored hash differs).

const INDEX = "focusos:days";
const PREFIX = "focusos:day:";

export type PastDay = { date: string; text: string; distance: number };

// One day as readable text. Numbers come from code (lib/day-stats.ts).
export function dayText(d: DayData): string {
  const v = dayView(d);
  const lines: string[] = [`Day ${v.date}.`];
  if (v.mission) {
    lines.push(`Mission: ${v.mission.title} (${v.mission.status}).`);
    if (v.mission.doneMeans) lines.push(`Done means: ${v.mission.doneMeans}.`);
  }
  if (v.tasks.length) {
    lines.push(`Tasks: ${v.tasks.map((t) => `${t.title} [${t.status}]`).join("; ")}.`);
  }
  const n = v.numbers;
  if (n.focusMinutes || n.sessionsCompleted || n.sessionsInterrupted) {
    lines.push(
      `Focus: ${n.focusMinutes} min in ${n.sessionsCompleted} completed sessions, ${n.sessionsInterrupted} interrupted.`
    );
  }
  if (n.minutesLost != null) lines.push(`Minutes lost (self-reported): ${n.minutesLost}.`);
  if (n.energy != null) lines.push(`Energy: ${n.energy}.`);
  if (v.sessionNotes.length) lines.push(`Session notes: ${v.sessionNotes.join(" | ")}`);
  const r = v.reflection;
  if (r) {
    if (r.completedWork) lines.push(`Completed: ${r.completedWork}`);
    if (r.blockers) lines.push(`Blockers: ${r.blockers}`);
    if (r.distractions) lines.push(`Distractions: ${r.distractions}`);
    if (r.lesson) lines.push(`Lesson: ${r.lesson}`);
    if (r.nextStartAction) lines.push(`Next start action: ${r.nextStartAction}`);
  }
  if (v.note) lines.push(`Note: ${v.note}`);
  const summary = coachSummary(d.reflection?.aiSummary);
  if (summary) lines.push(`Coach summary that day: ${summary}`);
  // Only the date line means nothing was recorded.
  return lines.length > 1 ? lines.join("\n") : "";
}

function coachSummary(aiSummary: string | null | undefined): string | null {
  if (!aiSummary) return null;
  try {
    const s = JSON.parse(aiSummary)?.coach?.summary;
    return typeof s === "string" ? s : null;
  } catch {
    return null;
  }
}

const dayNum = (date: string) => Number(date.replaceAll("-", ""));
const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

// Brings Redis up to date for these days. Returns how many were (re)embedded.
export async function syncDays(days: DayData[]): Promise<number> {
  const redis = await getRedis();
  if (!redis) return 0;
  const items = days.map((d) => ({ date: d.date, text: dayText(d) }));
  const stored = await Promise.all(
    items.map((i) => redis.json.get(PREFIX + i.date, { path: "$.hash" }))
  );
  const changed = items.filter((i, k) => {
    const old = (stored[k] as string[] | null)?.[0] ?? null;
    return i.text ? old !== sha(i.text) : old !== null;
  });
  // A day whose records were all deleted: drop its copy.
  for (const i of changed.filter((i) => !i.text)) await redis.del(PREFIX + i.date);
  const toEmbed = changed.filter((i) => i.text);
  if (toEmbed.length === 0) return 0;

  const vectors = await embed(toEmbed.map((i) => i.text));
  await ensureIndex(
    redis,
    INDEX,
    PREFIX,
    {
      "$.date": { type: SCHEMA_FIELD_TYPE.TAG, AS: "date" },
      "$.dayNum": { type: SCHEMA_FIELD_TYPE.NUMERIC, AS: "dayNum" },
    },
    vectors[0].length
  );
  for (const [k, i] of toEmbed.entries()) {
    await redis.json.set(PREFIX + i.date, "$", {
      date: i.date,
      dayNum: dayNum(i.date),
      text: i.text,
      hash: sha(i.text),
      vector: vectors[k],
    });
  }
  return toEmbed.length;
}

// Called after each coach answer: re-embeds any of the last 14 days that
// changed. Older days rarely change; `npm run rag:backfill` covers them.
export async function syncRecent(date: string): Promise<number> {
  return syncDays(await loadDays(addDays(date, -13), date));
}

// Past days whose meaning is closest to the query, older than the coach's
// 8-day window (those are already in its data).
export async function searchDays(
  vector: number[],
  date: string,
  k = 4
): Promise<PastDay[]> {
  const redis = await getRedis();
  if (!redis || !(await redis.ft._list()).includes(INDEX)) return [];
  const before = dayNum(addDays(date, -7));
  const res = await redis.ft.search(
    INDEX,
    `(@dayNum:[-inf (${before}])=>[KNN ${k} @vector $vec AS distance]`,
    {
      PARAMS: { vec: toBlob(vector) },
      SORTBY: "distance",
      RETURN: ["date", "distance", "$.text"],
      DIALECT: 2,
    }
  );
  return res.documents
    .map((d) => ({
      date: String(d.value.date),
      text: String(d.value["$.text"]),
      distance: Number(d.value.distance),
    }))
    // Loosely related at best past this point: leave it out.
    .filter((d) => d.distance < 0.6);
}
