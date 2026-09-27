import { SCHEMA_FIELD_TYPE, SCHEMA_VECTOR_FIELD_ALGORITHM, type RediSearchSchema } from "redis";
import { getRedis } from "@/lib/redis";
import { EMBED_MODEL } from "@/lib/ai/embed";

// Redis vector indexes used by the coach. Each index covers JSON docs whose
// key starts with a prefix, and has a `vector` field searched by meaning
// (KNN = "k nearest neighbours", cosine distance: 0 = same meaning).

type Redis = NonNullable<Awaited<ReturnType<typeof getRedis>>>;

const ready = new Set<string>(); // indexes checked in this process

// Creates the index if missing. If the embedding model or vector size
// changed since it was built, drops it with its docs and builds it fresh
// (only keys under our own prefix are ever deleted).
export async function ensureIndex(
  redis: Redis,
  name: string,
  prefix: string,
  fields: RediSearchSchema,
  dim: number
) {
  const key = `${name}:${dim}`;
  if (ready.has(key)) return;
  const metaKey = `focusos:meta:${name}`;
  const want = `${EMBED_MODEL}|${dim}`;
  const have = await redis.get(metaKey);
  const exists = (await redis.ft._list()).includes(name);
  if (exists && have !== want) {
    await redis.ft.dropIndex(name, { DD: true });
  }
  if (!exists || have !== want) {
    await redis.ft.create(
      name,
      {
        ...fields,
        "$.vector": {
          type: SCHEMA_FIELD_TYPE.VECTOR,
          ALGORITHM: SCHEMA_VECTOR_FIELD_ALGORITHM.HNSW,
          TYPE: "FLOAT32",
          DIM: dim,
          DISTANCE_METRIC: "COSINE",
          AS: "vector",
        },
      },
      { ON: "JSON", PREFIX: prefix }
    );
    await redis.set(metaKey, want);
  }
  ready.add(key);
}

export { SCHEMA_FIELD_TYPE };
