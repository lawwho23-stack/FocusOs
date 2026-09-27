import { LangCache } from "@redis-ai/langcache";
import { noul, TypeSafeClient } from "@typesafe-ai/sdk";

// LangCache (Redis Cloud semantic cache): when a question means the same
// as one answered before, return that answer without calling the LLM.
//
// Only for GENERAL questions ("how does time blocking work?"). An answer
// about Laww's own data depends on numbers that change every day, so it
// is never cached: Jev decides which kind each question is, and an answer
// containing any digit is not stored either.

const TTL_MS = 30 * 24 * 3600 * 1000; // 30 days
const THRESHOLD = 0.9; // similarity needed to count as the same question

export function cacheConfigured(): boolean {
  return !!(
    process.env.LANGCACHE_URL &&
    process.env.LANGCACHE_CACHE_ID &&
    process.env.LANGCACHE_API_KEY
  );
}

function client() {
  return new LangCache({
    serverURL: process.env.LANGCACHE_URL!,
    cacheId: process.env.LANGCACHE_CACHE_ID!,
    apiKey: process.env.LANGCACHE_API_KEY!,
  });
}

// True when the question can be answered without Laww's own data.
export async function isGeneralQuestion(question: string): Promise<boolean> {
  const jev = new TypeSafeClient({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api",
  });
  const res = await jev.systemOne({
    model: "jev-latest",
    state: { question },
    questions: {
      personal: noul(
        "Does answering `question` need the person's own tracked data, history, plans, feelings or situation (rather than general productivity knowledge)?",
        {
          true: "The answer depends on the person's own data, days, goals or situation.",
          false: "Any person asking this would get the same answer; it is general knowledge or a general method.",
        }
      ),
    },
  });
  return res.answers.personal.noul < 0.2;
}

export async function cacheLookup(question: string): Promise<string | null> {
  const res = await client().search({
    prompt: question,
    similarityThreshold: THRESHOLD,
  });
  return res.data[0]?.response ?? null;
}

export async function cacheStore(question: string, answer: string) {
  if (/\d/.test(answer)) return; // numbers mean it may be about Laww's data
  await client().set({ prompt: question, response: answer, ttlMillis: TTL_MS });
}
