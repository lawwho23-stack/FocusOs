import { createClient } from "redis";

// One shared Redis client (Redis Cloud) for the whole app.
// Why globalThis: same reason as lib/db.ts — Next.js reloads code often in
// dev, and each reload would otherwise open a new connection. On Vercel a
// warm function reuses the same connection between requests.
//
// Redis is optional: without REDIS_URL, getRedis() returns null and the
// caller carries on without it. A Redis outage must never break the coach.

export function redisConfigured(): boolean {
  return !!process.env.REDIS_URL;
}

function makeClient() {
  return createClient({
    url: process.env.REDIS_URL,
    socket: {
      // Give up on a dead server after 3s instead of hanging the request.
      connectTimeout: 3000,
      // After a dropped connection: retry quickly a few times, then stop.
      // The next getRedis() call starts a fresh connection.
      reconnectStrategy: (retries) => (retries > 3 ? false : 200 * retries),
    },
    // While disconnected, fail commands at once instead of queueing them.
    disableOfflineQueue: true,
  });
}

type RedisClient = ReturnType<typeof makeClient>;

const globalForRedis = globalThis as unknown as {
  redis: Promise<RedisClient> | undefined;
};

async function connect(): Promise<RedisClient> {
  const client = makeClient();
  // Without a listener, a connection error crashes the Node process.
  client.on("error", (e) => console.error("Redis error:", e.message));
  client.on("end", () => {
    globalForRedis.redis = undefined;
  });
  await client.connect();
  return client;
}

// The connected client, or null when REDIS_URL is not set.
// Throws if Redis is configured but unreachable; callers decide what to do.
export async function getRedis(): Promise<RedisClient | null> {
  if (!redisConfigured()) return null;
  if (!globalForRedis.redis) {
    globalForRedis.redis = connect().catch((e) => {
      globalForRedis.redis = undefined; // let the next call try again
      throw e;
    });
  }
  return globalForRedis.redis;
}
