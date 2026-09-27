import { createHash } from "node:crypto";
import { getRedis } from "@/lib/redis";
import { embed, toBlob } from "@/lib/ai/embed";
import { ensureIndex, SCHEMA_FIELD_TYPE } from "@/lib/ai/vectors";

// The coach's knowledge base: ideas from productivity and personal-
// development books, research and philosophy, researched on the web by
// Claude Code and checked by Jev before saving. Redis is the only home
// for it: one JSON doc per idea at focusos:kb:<slug>, searched by meaning.

const INDEX = "focusos:kb";
const PREFIX = "focusos:kb:";

export type KnowledgeCard = {
  slug: string;
  title: string;
  source: string; // "Author, Work (year)"
  kind: "book" | "research" | "philosophy";
  topic: string;
  idea: string;
  useWhen: string;
  tryThis: string;
  evidence: string;
  urls: string[];
  jev?: Record<string, number>; // quality scores from the Jev gate
};

// What the coach sees for a matching card.
export type KnowledgeHit = {
  title: string;
  source: string;
  idea: string;
  tryThis: string;
  evidence: string;
  distance: number;
};

// The text that gets embedded: what the idea is and when it applies,
// so a question describing a problem finds the idea that fits it.
const embedText = (c: KnowledgeCard) => `${c.title}. ${c.idea} Use when: ${c.useWhen}`;
const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

// Saves cards, embedding only new or changed ones. Returns how many were embedded.
export async function saveCards(cards: KnowledgeCard[]): Promise<number> {
  const redis = await getRedis();
  if (!redis) throw new Error("REDIS_URL is not set.");
  const stored = await Promise.all(
    cards.map((c) => redis.json.get(PREFIX + c.slug, { path: "$.hash" }))
  );
  const changed = cards.filter(
    (c, k) => (stored[k] as string[] | null)?.[0] !== sha(JSON.stringify(c))
  );
  if (changed.length === 0) return 0;

  const vectors: number[][] = [];
  for (let i = 0; i < changed.length; i += 16) {
    vectors.push(...(await embed(changed.slice(i, i + 16).map(embedText))));
  }
  await ensureIndex(
    redis,
    INDEX,
    PREFIX,
    {
      "$.topic": { type: SCHEMA_FIELD_TYPE.TAG, AS: "topic" },
      "$.kind": { type: SCHEMA_FIELD_TYPE.TAG, AS: "kind" },
    },
    vectors[0].length
  );
  for (const [k, c] of changed.entries()) {
    await redis.json.set(PREFIX + c.slug, "$", {
      ...c,
      hash: sha(JSON.stringify(c)),
      vector: vectors[k],
    });
  }
  return changed.length;
}

// Cards whose meaning is closest to the question (cosine distance < 0.55).
export async function searchKnowledge(vector: number[], k = 3): Promise<KnowledgeHit[]> {
  const redis = await getRedis();
  if (!redis || !(await redis.ft._list()).includes(INDEX)) return [];
  const res = await redis.ft.search(INDEX, `*=>[KNN ${k} @vector $vec AS distance]`, {
    PARAMS: { vec: toBlob(vector) },
    SORTBY: "distance",
    RETURN: ["distance", "$.title", "$.source", "$.idea", "$.tryThis", "$.evidence"],
    DIALECT: 2,
  });
  return res.documents
    .map((d) => ({
      title: String(d.value["$.title"]),
      source: String(d.value["$.source"]),
      idea: String(d.value["$.idea"]),
      tryThis: String(d.value["$.tryThis"]),
      evidence: String(d.value["$.evidence"]),
      distance: Number(d.value.distance),
    }))
    .filter((h) => h.distance < 0.55);
}
