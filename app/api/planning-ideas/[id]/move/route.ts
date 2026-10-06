import { parsePlanningMove } from "@/lib/planning-order";
import {
  moveInTransaction,
  planningError,
  planningTransaction,
} from "@/lib/planning-store";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const parsed = parsePlanningMove(await req.json().catch(() => null));
  if ("error" in parsed)
    return Response.json({ error: parsed.error }, { status: 400 });
  const { id } = await params;
  try {
    return Response.json(
      await planningTransaction((tx) => moveInTransaction(tx, id, parsed.data)),
    );
  } catch (error) {
    return planningError(error, "Could not move your plan. Please try again.");
  }
}
