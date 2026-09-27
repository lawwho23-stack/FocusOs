import { openRouter } from "@/lib/ai/llm";

// Text -> embedding vectors (lists of numbers that capture meaning), so
// Redis can find texts that mean something similar to a question.
// qwen3-embedding handles mixed Burmese + English well.
//
// Changing EMBED_MODEL changes the vector size: lib/ai/vectors.ts notices
// and rebuilds the indexes, so every text gets re-embedded with the new model.

export const EMBED_MODEL =
  process.env.EMBED_MODEL || "qwen/qwen3-embedding-4b";

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await openRouter().embeddings.generate({
    appTitle: "FocusOS",
    requestBody: { model: EMBED_MODEL, input: texts },
  });
  if (typeof res === "string") throw new Error("Unexpected embeddings response.");
  const vectors = res.data.map((d) => d.embedding);
  if (vectors.length !== texts.length || vectors.some((v) => typeof v === "string")) {
    throw new Error("Embeddings response did not match the input.");
  }
  return vectors as number[][];
}

// Redis vector queries take the vector as raw float32 bytes.
export function toBlob(vector: number[]): Buffer {
  return Buffer.from(new Float32Array(vector).buffer);
}
