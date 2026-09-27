import { randomUUID } from "node:crypto";
import { getRedis } from "@/lib/redis";
import { askModel, extractJson } from "@/lib/ai/llm";
import { embed, toBlob } from "@/lib/ai/embed";
import { ensureIndex, SCHEMA_FIELD_TYPE } from "@/lib/ai/vectors";

// The coach's memory, in Redis.
//
// Short-term: today's chat thread. The full thread stays in Postgres
// (CoachMessage); only the latest turns fit in the prompt, so older turns
// are folded into a running summary kept at focusos:session:<date>.
//
// Long-term: durable facts about Laww learned from chats ("loses focus to
// YouTube after 9pm"), one JSON doc per fact at focusos:mem:<id>, searched
// by meaning. Laww can list and delete them (/api/ai/coach/memory).

// ---------------------------------------------------------------------------
// Short-term

type Summary = { text: string; upTo: number }; // upTo = oldest turns covered

const sessionKey = (date: string) => `focusos:session:${date}`;
const SESSION_TTL = 14 * 24 * 3600; // seconds; Postgres keeps the thread anyway

export async function getSummary(date: string): Promise<Summary | null> {
  const redis = await getRedis();
  if (!redis) return null;
  const raw = await redis.get(sessionKey(date));
  return raw ? (JSON.parse(raw) as Summary) : null;
}

export async function clearSummary(date: string) {
  const redis = await getRedis();
  if (redis) await redis.del(sessionKey(date));
}

// Folds turns that fell out of the prompt window into the summary.
// `older` = every turn outside the window, oldest first.
export async function updateSummary(
  date: string,
  older: { role: string; content: string }[]
) {
  const redis = await getRedis();
  if (!redis) return;
  const current = await getSummary(date);
  const fresh = older.slice(current?.upTo ?? 0);
  if (fresh.length === 0) return;
  const text = await askModel({
    system:
      "You keep a running summary of a coaching chat between a productivity coach and one person. Merge the new turns into the summary. Keep what they asked, what the coach advised, commitments made, and open questions. Keep numbers exactly as written. At most 150 words. Plain text only.",
    user: JSON.stringify({ summary: current?.text ?? "", newTurns: fresh }),
    maxTokens: 600,
  });
  if (!text) return;
  await redis.set(sessionKey(date), JSON.stringify({ text, upTo: older.length }), {
    EX: SESSION_TTL,
  });
}

// ---------------------------------------------------------------------------
// Long-term

const INDEX = "focusos:mem";
const PREFIX = "focusos:mem:";

export type Memory = {
  id: string;
  text: string;
  source: string; // chat date it was learned on
  createdAt: number;
  updatedAt: number;
};

async function memIndex(dim: number) {
  const redis = await getRedis();
  if (!redis) return null;
  await ensureIndex(
    redis,
    INDEX,
    PREFIX,
    { "$.updatedAt": { type: SCHEMA_FIELD_TYPE.NUMERIC, AS: "updatedAt", SORTABLE: true } },
    dim
  );
  return redis;
}

async function nearest(vector: number[], k: number) {
  const redis = await getRedis();
  if (!redis || !(await redis.ft._list()).includes(INDEX)) return [];
  const res = await redis.ft.search(INDEX, `*=>[KNN ${k} @vector $vec AS distance]`, {
    PARAMS: { vec: toBlob(vector) },
    SORTBY: "distance",
    RETURN: ["distance", "$.text"],
    DIALECT: 2,
  });
  return res.documents.map((d) => ({
    id: d.id.slice(PREFIX.length),
    text: String(d.value["$.text"]),
    distance: Number(d.value.distance),
  }));
}

// Facts relevant to the question (cosine distance < 0.6).
export async function searchMemories(vector: number[], k = 5): Promise<string[]> {
  return (await nearest(vector, k)).filter((m) => m.distance < 0.6).map((m) => m.text);
}

const EXTRACT = `You maintain long-term memory for a productivity coach about one person.
Pick out 0 to 3 DURABLE facts that the PERSON states about themself in "person" and that will still matter in future weeks: recurring habits, triggers, preferences, goals, constraints, what works or fails for them.
"coach" is only context for what "person" is replying to. Never take a fact from "coach".
Do not store: one-day events, numbers from a single day or session, guesses, or facts already in "known" (return an empty list when nothing new).
Most messages are questions with no durable fact: return {"facts": []} for them.
Each fact is one short sentence in English about "Laww" (the person), even if they wrote in Burmese.
Return ONLY JSON: {"facts": string[]}`;

// Learns from one exchange. A fact that nearly matches a stored one
// (distance < 0.1, i.e. similarity > 0.9) replaces it instead of adding a copy.
export async function extractMemories(opts: {
  date: string;
  question: string;
  answer: string;
}): Promise<number> {
  const redis = await getRedis();
  if (!redis) return 0;
  const [qVec] = await embed([opts.question]);
  const known = (await nearest(qVec, 8)).map((m) => m.text);
  const parsed = extractJson(
    await askModel({
      system: EXTRACT,
      user: JSON.stringify({ known, person: opts.question, coach: opts.answer }),
      json: true,
      maxTokens: 400,
    })
  ) as { facts?: unknown } | null;
  const facts = Array.isArray(parsed?.facts)
    ? parsed.facts.filter((f): f is string => typeof f === "string" && f.trim() !== "").slice(0, 3)
    : [];
  if (facts.length === 0) return 0;

  const vectors = await embed(facts);
  const store = await memIndex(vectors[0].length);
  if (!store) return 0;
  const now = Date.now();
  for (const [k, text] of facts.entries()) {
    const [close] = await nearest(vectors[k], 1);
    if (close && close.distance < 0.1) {
      await store.json.set(PREFIX + close.id, "$.text", text);
      await store.json.set(PREFIX + close.id, "$.vector", vectors[k]);
      await store.json.set(PREFIX + close.id, "$.updatedAt", now);
    } else {
      const id = randomUUID();
      const doc: Memory & { vector: number[] } = {
        id, text, source: opts.date, createdAt: now, updatedAt: now, vector: vectors[k],
      };
      await store.json.set(PREFIX + id, "$", doc);
    }
  }
  return facts.length;
}

export async function listMemories(): Promise<Memory[]> {
  const redis = await getRedis();
  if (!redis || !(await redis.ft._list()).includes(INDEX)) return [];
  const res = await redis.ft.search(INDEX, "*", {
    SORTBY: { BY: "updatedAt", DIRECTION: "DESC" },
    RETURN: ["$.id", "$.text", "$.source", "$.createdAt", "updatedAt"],
    LIMIT: { from: 0, size: 200 },
    DIALECT: 2,
  });
  return res.documents.map((d) => ({
    id: String(d.value["$.id"]),
    text: String(d.value["$.text"]),
    source: String(d.value["$.source"]),
    createdAt: Number(d.value["$.createdAt"]),
    updatedAt: Number(d.value.updatedAt),
  }));
}

// Forget one fact, or all of them when id is omitted.
export async function deleteMemories(id?: string): Promise<number> {
  const redis = await getRedis();
  if (!redis) return 0;
  if (id) return redis.del(PREFIX + id);
  const all = await listMemories();
  return all.length ? redis.del(all.map((m) => PREFIX + m.id)) : 0;
}
