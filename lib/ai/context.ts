import { redisConfigured } from "@/lib/redis";
import { embed } from "@/lib/ai/embed";
import { searchDays, syncRecent, type PastDay } from "@/lib/ai/rag";
import { searchMemories } from "@/lib/ai/memory";
import { searchKnowledge, type KnowledgeHit } from "@/lib/ai/knowledge";

// Background for one coach answer: long-term facts about Laww, past days
// (older than the 7-day window) and knowledge-base ideas that match the query. Fails open:
// if Redis or embeddings break, the coach answers from its usual data.

export type Background = {
  memories: string[];
  pastDays: PastDay[];
  knowledge: KnowledgeHit[];
  vector: number[] | null; // the query's embedding, reused by the caller
};

export const NO_BACKGROUND: Background = {
  memories: [],
  pastDays: [],
  knowledge: [],
  vector: null,
};

export async function gatherBackground(date: string, query: string): Promise<Background> {
  if (!redisConfigured() || !query.trim()) return NO_BACKGROUND;
  try {
    const [vector] = await embed([query]);
    const [memories, pastDays, knowledge] = await Promise.all([
      searchMemories(vector),
      searchDays(vector, date),
      searchKnowledge(vector),
    ]);
    return { memories, pastDays, knowledge, vector };
  } catch (e) {
    console.error("Coach background (Redis) failed, continuing without:", e);
    return NO_BACKGROUND;
  }
}

// Re-embeds recently changed days. Run AFTER the reply (Next `after()`):
// search only covers days older than the 7-day window, so a day edited
// today is not searchable yet anyway and the answer need not wait.
export async function syncAfterReply(date: string) {
  if (!redisConfigured()) return;
  try {
    const synced = await syncRecent(date);
    if (synced) console.log(`RAG: re-embedded ${synced} changed day(s).`);
  } catch (e) {
    console.error("RAG sync failed:", e);
  }
}
