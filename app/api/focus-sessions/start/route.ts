import { db } from "@/lib/db";

// POST /api/focus-sessions/start — begin one focus session.
// Body: { taskId? (optional), plannedMinutes }
// Rules: plannedMinutes must be positive. Only one running session
// at a time — a second start gets 409.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (
    !Number.isInteger(body?.plannedMinutes) ||
    body.plannedMinutes <= 0
  ) {
    return Response.json(
      { error: "plannedMinutes must be a positive number." },
      { status: 400 }
    );
  }
  if (body.taskId !== undefined && body.taskId !== null) {
    const task = await db.task.findUnique({ where: { id: body.taskId } });
    if (!task) {
      return Response.json({ error: "Task not found." }, { status: 404 });
    }
  }
  const running = await db.focusSession.findFirst({
    where: { status: "running" },
  });
  if (running) {
    return Response.json(
      { error: "A focus session is already running.", session: running },
      { status: 409 }
    );
  }
  const session = await db.focusSession.create({
    data: {
      taskId: body.taskId ?? null,
      plannedMinutes: body.plannedMinutes,
    },
  });
  return Response.json(session, { status: 201 });
}
