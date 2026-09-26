import { db } from "@/lib/db";
import { parseGoal } from "@/lib/goals";

// PATCH /api/goals/:id — edit any field or change status.
// Body: any of { title, why, plan, horizon, targetDate, status }
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Body is required." }, { status: 400 });
  }
  const parsed = parseGoal(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  try {
    const goal = await db.goal.update({ where: { id }, data: parsed.data });
    return Response.json(goal);
  } catch {
    return Response.json({ error: "Goal not found." }, { status: 404 });
  }
}

// DELETE /api/goals/:id — remove a goal for good.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { count } = await db.goal.deleteMany({ where: { id } });
  if (!count) {
    return Response.json({ error: "Goal not found." }, { status: 404 });
  }
  return Response.json({ deleted: true });
}
