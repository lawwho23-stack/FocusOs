import { getRedis, redisConfigured } from "@/lib/redis";

// GET /api/ai/coach/health — can the coach's server code reach Redis?
// { redis: "up" | "down" | "not configured" }. Never returns the URL.
export async function GET() {
  if (!redisConfigured()) {
    return Response.json({ redis: "not configured" });
  }
  try {
    const redis = await getRedis();
    const pong = await redis!.ping();
    return Response.json({ redis: pong === "PONG" ? "up" : "down" });
  } catch (e) {
    console.error("Redis health check failed:", e);
    return Response.json({ redis: "down" }, { status: 503 });
  }
}
