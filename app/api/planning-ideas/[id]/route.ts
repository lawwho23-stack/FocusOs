import { updatePlan, planningError } from "@/lib/planning-store";
import { parsePlanningIdea } from "@/lib/planning-ideas";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = parsePlanningIdea(
    await req.json().catch(() => null),
    "update",
  );
  if ("error" in parsed)
    return Response.json({ error: parsed.error }, { status: 400 });
  try {
    const idea = await updatePlan(id, parsed.data);
    return Response.json(idea);
  } catch (error) {
    return planningError(
      error,
      "Could not update your idea. Please try again.",
    );
  }
}
