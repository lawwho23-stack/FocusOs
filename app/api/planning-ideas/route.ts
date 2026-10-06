import { db } from "@/lib/db";
import { createPlan, planningOrder, planningError } from "@/lib/planning-store";
import { parsePlanningIdea } from "@/lib/planning-ideas";

export async function GET() {
  try {
    const ideas = await db.planningIdea.findMany({ orderBy: planningOrder });
    return Response.json(ideas);
  } catch {
    return Response.json(
      { error: "Could not load ideas. Please try again." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const parsed = parsePlanningIdea(
    await req.json().catch(() => null),
    "create",
  );
  if ("error" in parsed)
    return Response.json({ error: parsed.error }, { status: 400 });
  try {
    const idea = await createPlan(parsed.data);
    return Response.json(idea, { status: 201 });
  } catch (error) {
    return planningError(
      error,
      "Could not save your idea. Your draft is still here; please try again.",
    );
  }
}
