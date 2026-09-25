import { db } from "@/lib/db";

// GET /api/missions/:id/tasks — tasks in display order.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tasks = await db.task.findMany({
    where: { missionId: id },
    orderBy: { orderIndex: "asc" },
  });
  return Response.json(tasks);
}

// POST /api/missions/:id/tasks — add one small action to a mission.
// Body: { title, description?, estimatedMinutes? }
// The new task goes last: orderIndex = current max + 1.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    return Response.json({ error: "Title is required." }, { status: 400 });
  }
  if (
    body.estimatedMinutes !== undefined &&
    body.estimatedMinutes !== null &&
    (!Number.isInteger(body.estimatedMinutes) || body.estimatedMinutes <= 0)
  ) {
    return Response.json(
      { error: "estimatedMinutes must be a positive number." },
      { status: 400 }
    );
  }
  const mission = await db.dailyMission.findUnique({ where: { id } });
  if (!mission) {
    return Response.json({ error: "Mission not found." }, { status: 404 });
  }
  const last = await db.task.findFirst({
    where: { missionId: id },
    orderBy: { orderIndex: "desc" },
  });
  const task = await db.task.create({
    data: {
      missionId: id,
      title,
      description: body.description ?? null,
      estimatedMinutes: body.estimatedMinutes ?? null,
      orderIndex: (last?.orderIndex ?? -1) + 1,
    },
  });
  return Response.json(task, { status: 201 });
}
