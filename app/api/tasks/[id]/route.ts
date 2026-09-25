import { db } from "@/lib/db";

// PATCH /api/tasks/:id — edit a task.
// Body: any of { title?, description?, estimatedMinutes?, status? }
// Completing sets completedAt. Reopening clears it.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Body is required." }, { status: 400 });
  }
  if (body.title !== undefined && !String(body.title).trim()) {
    return Response.json({ error: "Title cannot be empty." }, { status: 400 });
  }
  const current = await db.task.findUnique({ where: { id } });
  if (!current) {
    return Response.json({ error: "Task not found." }, { status: 404 });
  }
  const task = await db.task.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: String(body.title).trim() } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.estimatedMinutes !== undefined
        ? { estimatedMinutes: body.estimatedMinutes }
        : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      // Completion timestamp follows the status automatically.
      ...(body.status === "completed" && current.status !== "completed"
        ? { completedAt: new Date() }
        : {}),
      ...(body.status !== undefined &&
      body.status !== "completed" &&
      current.status === "completed"
        ? { completedAt: null }
        : {}),
    },
  });
  return Response.json(task);
}

// DELETE /api/tasks/:id — remove a task.
// Its sessions survive but lose the link (taskId becomes null).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await db.task.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Task not found." }, { status: 404 });
  }
}
