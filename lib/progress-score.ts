import { createHash } from "node:crypto";
import { score, TypeSafeClient } from "@typesafe-ai/sdk";
import { db } from "@/lib/db";
import { dayToDate } from "@/lib/day";
import { hasReflection, type DayData } from "@/lib/day-stats";
import { coachConfigured, dayView, QUALITY } from "@/lib/coach";

// Per-day progress score for the Progress page.
//   - Code counts (tasks, focus minutes). Jev never counts.
//   - Jev judges each day against its OWN mission and tasks, on the same
//     0-3 rubric the coach uses (QUALITY), so days compare fairly.
//   - Results are saved in DayScore. A day is re-scored only when its data
//     fingerprint (dataHash) changes, so reopening the page costs nothing.

const MODEL = "jev-latest";
const BATCH = 8; // days per Jev request

export type DayScoreView = {
  score: number; // 0-100
  confidence: number;
  label: string;
} | null;

// A day with nothing recorded scores 0 in code: no AI call needed.
function isEmpty(d: DayData): boolean {
  return !d.mission && d.sessions.length === 0 && !hasReflection(d.reflection) && !d.note;
}

function hashOf(view: ReturnType<typeof dayView>): string {
  return createHash("sha256").update(JSON.stringify(view)).digest("hex");
}

function toView(level: number, confidence: number): DayScoreView {
  const max = QUALITY.length - 1;
  const idx = Math.min(max, Math.max(0, Math.round(level)));
  return {
    score: Math.round((level / max) * 100),
    confidence: Math.round(confidence * 100) / 100,
    label: QUALITY[idx],
  };
}

// Question keys must be plain identifiers: 2026-09-25 -> d20260925.
const keyOf = (date: string) => "d" + date.replaceAll("-", "");

// Scores for every day in `days`, keyed by date. Days still running
// (today, with a session in progress) are scored like any other: the hash
// changes when the session finishes, so the score updates then.
export async function scoreDays(
  days: DayData[]
): Promise<{ scores: Record<string, DayScoreView>; aiError: string | null }> {
  const scores: Record<string, DayScoreView> = {};
  const active = days.filter((d) => !isEmpty(d));
  for (const d of days) if (isEmpty(d)) scores[d.date] = { score: 0, confidence: 1, label: "Nothing recorded." };
  if (active.length === 0) return { scores, aiError: null };

  const views = new Map(active.map((d) => [d.date, dayView(d)]));
  const hashes = new Map([...views].map(([date, v]) => [date, hashOf(v)]));

  const saved = await db.dayScore.findMany({
    where: { scoreDate: { in: active.map((d) => dayToDate(d.date)) } },
  });
  const savedBy = new Map(saved.map((s) => [s.scoreDate.toISOString().slice(0, 10), s]));

  const stale: string[] = [];
  for (const d of active) {
    const s = savedBy.get(d.date);
    if (s && s.dataHash === hashes.get(d.date)) {
      scores[d.date] = toView(s.level, s.confidence);
    } else {
      stale.push(d.date);
    }
  }
  if (stale.length === 0) return { scores, aiError: null };

  if (!coachConfigured()) {
    for (const date of stale) scores[date] = null;
    return { scores, aiError: "Jev not configured: add OPENROUTER_API_KEY to .env." };
  }

  const client = new TypeSafeClient({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api",
  });
  let aiError: string | null = null;

  for (let i = 0; i < stale.length; i += BATCH) {
    const chunk = stale.slice(i, i + BATCH);
    try {
      const res = await client.systemOne({
        model: MODEL,
        state: { days: Object.fromEntries(chunk.map((date) => [keyOf(date), views.get(date)!])) },
        questions: Object.fromEntries(
          chunk.map((date) => [
            keyOf(date),
            score(
              `How productive was \`days.${keyOf(date)}\`, judged against its own mission, tasks and \`days.${keyOf(date)}.numbers\`? Judge only this day; ignore the other days.`,
              QUALITY
            ),
          ])
        ),
      });
      // Saved one by one, not in parallel: the database allows one connection.
      for (const date of chunk) {
        const a = res.answers[keyOf(date)];
        const data = {
          score: toView(a.score, a.confidence)!.score,
          level: a.score,
          confidence: a.confidence,
          dataHash: hashes.get(date)!,
          model: MODEL,
        };
        await db.dayScore.upsert({
          where: { scoreDate: dayToDate(date) },
          create: { scoreDate: dayToDate(date), ...data },
          update: data,
        });
        scores[date] = toView(a.score, a.confidence);
      }
    } catch (e) {
      console.error("Jev progress scoring failed:", e);
      aiError = "Jev scoring failed for some days. Reload to try again.";
      // Fall back to the last saved score (from older data) when there is one.
      for (const date of chunk) {
        const old = savedBy.get(date);
        scores[date] ??= old ? toView(old.level, old.confidence) : null;
      }
    }
  }
  return { scores, aiError };
}
