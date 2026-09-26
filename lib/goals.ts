import { dayToDate, isValidDateString } from "@/lib/day";

// Validation shared by POST /api/goals and PATCH /api/goals/:id.
export const HORIZONS = ["quarter", "year", "multi_year"] as const;
export const GOAL_STATUSES = ["active", "achieved", "dropped"] as const;

type GoalInput = {
  title?: string;
  why?: string | null;
  plan?: string | null;
  horizon?: (typeof HORIZONS)[number];
  targetDate?: Date | null;
  status?: (typeof GOAL_STATUSES)[number];
};

// Turns a request body into Prisma data, or an error message.
// Only fields present in the body are returned, so PATCH edits one field
// without wiping the others. Empty text becomes null.
export function parseGoal(
  body: Record<string, unknown>
): { data: GoalInput } | { error: string } {
  const data: GoalInput = {};
  const text = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  if (body.title !== undefined) {
    const t = text(body.title);
    if (!t) return { error: "Title cannot be empty." };
    data.title = t;
  }
  if (body.why !== undefined) data.why = text(body.why);
  if (body.plan !== undefined) data.plan = text(body.plan);
  if (body.horizon !== undefined) {
    if (!HORIZONS.includes(body.horizon as GoalInput["horizon"] & string)) {
      return { error: `horizon must be one of ${HORIZONS.join(", ")}.` };
    }
    data.horizon = body.horizon as GoalInput["horizon"];
  }
  if (body.status !== undefined) {
    if (!GOAL_STATUSES.includes(body.status as GoalInput["status"] & string)) {
      return { error: `status must be one of ${GOAL_STATUSES.join(", ")}.` };
    }
    data.status = body.status as GoalInput["status"];
  }
  if (body.targetDate !== undefined) {
    if (body.targetDate === null || body.targetDate === "") {
      data.targetDate = null;
    } else if (isValidDateString(body.targetDate)) {
      data.targetDate = dayToDate(body.targetDate);
    } else {
      return { error: "targetDate must be YYYY-MM-DD." };
    }
  }
  return { data };
}
