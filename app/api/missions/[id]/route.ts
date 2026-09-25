import { db } from "@/lib/db";

// GET /api/missions/:id — one mission with its tasks and their sessions.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const mission = await db.dailyMission.findUnique({
    where: { id },
    include: {
      tasks: { orderBy: { orderIndex: "asc" }, include: { sessions: true } },
    },
  });
  if (!mission) {
    return Response.json({ error: "Mission not found." }, { status: 404 });
  }
  return Response.json(mission);
}

// PATCH /api/missions/:id — edit a mission or change its status.
// Body: any of { title?, description?, status?, availableMinutes?, successDefinition? }
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
  try {
    const mission = await db.dailyMission.update({
      where: { id },
      data: {
        ...(body.title !== undefined
          ? { title: String(body.title).trim() }
          : {}),
        ...(body.description !== undefined
          ? { description: body.description }
          : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.availableMinutes !== undefined
          ? { availableMinutes: body.availableMinutes }
          : {}),
        ...(body.successDefinition !== undefined
          ? { successDefinition: body.successDefinition }
          : {}),
      },
    });
    return Response.json(mission);
  } catch {
    return Response.json({ error: "Mission not found." }, { status: 404 });
  }
}
