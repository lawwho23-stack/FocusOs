import { PLANNING_STATUSES, type PlanningStatus } from "./planning-ideas";

export const BOARD_STATUSES = ["saved", "planned", "action", "done"] as const;
export const PLANNING_LABELS: Record<PlanningStatus, string> = {
  saved: "Idea",
  planned: "Planned",
  action: "Action",
  done: "Done",
  archived: "Archived",
};
export type PlanningMove = { status: PlanningStatus; beforeId: string | null };
export class PlanningMoveError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function parsePlanningMove(
  body: unknown,
): { data: PlanningMove } | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body))
    return { error: "A JSON object is required." };
  const { status, beforeId } = body as Record<string, unknown>;
  if (!PLANNING_STATUSES.includes(status as PlanningStatus))
    return { error: "Invalid planning status." };
  if (
    beforeId !== null &&
    (typeof beforeId !== "string" || !beforeId.trim() || beforeId.length > 200)
  )
    return { error: "beforeId must be a plan ID or null." };
  return {
    data: {
      status: status as PlanningStatus,
      beforeId: beforeId as string | null,
    },
  };
}

// Clone before moving: a canceled drag must still have an untouched snapshot.
export function arrangePlans<
  T extends { id: string; status: string; position: number },
>(
  plans: T[],
  id: string,
  status: PlanningStatus,
  beforeId: string | null,
): T[] {
  const plan = plans.find((p) => p.id === id);
  if (!plan) throw new PlanningMoveError("Idea not found.", 404);
  if (
    beforeId !== null &&
    (beforeId === id ||
      !plans.some((p) => p.id === beforeId && p.status === status))
  ) {
    throw new PlanningMoveError(
      "The destination anchor has changed. Reload the board and try again.",
      409,
    );
  }
  return PLANNING_STATUSES.flatMap((column) => {
    const items = plans
      .filter((p) => p.status === column && p.id !== id)
      .sort((a, b) => a.position - b.position);
    if (column === status)
      items.splice(
        beforeId === null
          ? items.length
          : items.findIndex((p) => p.id === beforeId),
        0,
        { ...plan, status },
      );
    return items.map((p, position) => ({ ...p, position }));
  });
}
