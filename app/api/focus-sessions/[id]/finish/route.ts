import { db } from "@/lib/db";

// POST /api/focus-sessions/:id/finish — end a running session.
// Body: { status? (completed | cancelled | interrupted, default completed),
//         outcome?, interruptionNote? }
// The server computes actualMinutes from start/end time.
// The browser clock is never trusted for duration.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) ?? {};
  const status = body.status ?? "completed";
  if (!["completed", "cancelled", "interrupted"].includes(status)) {
    return Response.json(
      { error: "status must be completed, cancelled, or interrupted." },
      { status: 400 }
    );
  }
  const session = await db.focusSession.findUnique({ where: { id } });
  if (!session) {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }
  if (session.status !== "running") {
    return Response.json(
      { error: "Only a running session can be finished." },
      { status: 409 }
    );
  }
  const endedAt = new Date();
  const actualMinutes = Math.max(
    0,
    Math.round((endedAt.getTime() - session.startedAt.getTime()) / 60000)
  );
  const finished = await db.focusSession.update({
    where: { id },
    data: {
      endedAt,
      actualMinutes,
      status,
      outcome: body.outcome ?? null,
      interruptionNote: body.interruptionNote ?? null,
    },
  });
  return Response.json(finished);
}
