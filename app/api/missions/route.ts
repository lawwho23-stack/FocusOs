import { db } from "@/lib/db";
import { dayToDate, isValidDateString, resolveDay } from "@/lib/day";

// POST /api/missions — create one daily mission.
// Body: { projectId, title, description?, missionDate? (YYYY-MM-DD, default today),
//         availableMinutes?, successDefinition? }
// Rule: one mission per day (V1). Second attempt for the same date gets 409.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    return Response.json({ error: "Title is required." }, { status: 400 });
  }
  if (typeof body?.projectId !== "string" || !body.projectId) {
    return Response.json({ error: "projectId is required." }, { status: 400 });
  }
  const day = body.missionDate === undefined ? resolveDay(null) : body.missionDate;
  if (!isValidDateString(day)) {
    return Response.json(
      { error: "missionDate must be YYYY-MM-DD." },
      { status: 400 }
    );
  }
  if (
    body.availableMinutes !== undefined &&
    body.availableMinutes !== null &&
    (!Number.isInteger(body.availableMinutes) || body.availableMinutes <= 0)
  ) {
    return Response.json(
      { error: "availableMinutes must be a positive number." },
      { status: 400 }
    );
  }
  const project = await db.project.findUnique({
    where: { id: body.projectId },
  });
  if (!project) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }
  const existing = await db.dailyMission.findFirst({
    where: { missionDate: dayToDate(day) },
  });
  if (existing) {
    return Response.json(
      { error: "A mission already exists for this date.", mission: existing },
      { status: 409 }
    );
  }
  const mission = await db.dailyMission.create({
    data: {
      projectId: body.projectId,
      missionDate: dayToDate(day),
      title,
      description: body.description ?? null,
      availableMinutes: body.availableMinutes ?? null,
      successDefinition: body.successDefinition ?? null,
    },
  });
  return Response.json(mission, { status: 201 });
}
