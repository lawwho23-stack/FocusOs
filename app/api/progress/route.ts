import { addDays, resolveDay } from "@/lib/day";
import { hasReflection, loadDays } from "@/lib/day-stats";

// GET /api/progress?days=7&end=YYYY-MM-DD — one aggregate per day, oldest
// first, ending on `end` (default today). Up to 42 days, so the calendar
// can mark a whole month. Powers the week strip and the calendar dots.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = parseInt(url.searchParams.get("days") || "7", 10);
  const days = Math.min(Math.max(Number.isNaN(raw) ? 7 : raw, 1), 42);
  const end = resolveDay(url.searchParams.get("end"));
  if (!end) {
    return Response.json({ error: "end must be YYYY-MM-DD." }, { status: 400 });
  }

  const list = await loadDays(addDays(end, -(days - 1)), end);
  return Response.json(
    list.map((d) => ({
      date: d.date,
      hasMission: !!d.mission,
      missionDone: d.mission?.status === "completed",
      tasksDone: d.stats.tasksDone,
      tasksTotal: d.stats.tasksTotal,
      focusMinutes: d.stats.focusMinutes,
      reflected: hasReflection(d.reflection),
      hasNote: !!d.note,
    }))
  );
}
