import { db } from "@/lib/db";
import { parseGoal } from "@/lib/goals";

// GET /api/goals — every goal: active first, then nearest target date.
export async function GET() {
  const goals = await db.goal.findMany({
    orderBy: [
      { status: "asc" },
      { targetDate: { sort: "asc", nulls: "last" } },
      { createdAt: "asc" },
    ],
  });
  return Response.json(goals);
}

// POST /api/goals — create a goal.
// Body: { title, horizon (quarter|year|multi_year), why?, plan?, targetDate? }
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Body is required." }, { status: 400 });
  }
  if (body.title === undefined || body.horizon === undefined) {
    return Response.json(
      { error: "title and horizon are required." },
      { status: 400 }
    );
  }
  const parsed = parseGoal(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  const { title, horizon, ...rest } = parsed.data;
  const goal = await db.goal.create({
    data: { title: title!, horizon: horizon!, ...rest },
  });
  return Response.json(goal, { status: 201 });
}
