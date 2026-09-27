import { deleteMemories, listMemories } from "@/lib/ai/memory";
import { redisConfigured } from "@/lib/redis";

// The coach's long-term memory: what it has learned about Laww from chats.
// He can read every fact and delete any of them.

// GET /api/ai/coach/memory — every fact, newest first.
export async function GET() {
  if (!redisConfigured()) return Response.json([]);
  return Response.json(await listMemories());
}

// DELETE /api/ai/coach/memory?id=<id> — forget one fact.
// DELETE /api/ai/coach/memory?all=1 — forget everything.
export async function DELETE(req: Request) {
  const params = new URL(req.url).searchParams;
  const id = params.get("id");
  if (!id && params.get("all") !== "1") {
    return Response.json({ error: "Pass ?id=<id> or ?all=1." }, { status: 400 });
  }
  const deleted = await deleteMemories(id ?? undefined);
  return Response.json({ deleted });
}
