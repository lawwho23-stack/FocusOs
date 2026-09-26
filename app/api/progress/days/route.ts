import { addDays, resolveDay } from "@/lib/day";
import { loadDays } from "@/lib/day-stats";
import { scoreDays } from "@/lib/progress-score";

// First load of a long range can mean several Jev requests in a row.
export const maxDuration = 60;

// GET /api/progress/days?days=30&end=YYYY-MM-DD — the Progress page.
// One row per day, newest first: tasks done, focus time, and Jev's
// progress score (0-100). Scores are cached in DayScore; only days whose
// data changed are sent to Jev. Days with nothing recorded score 0 in code.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = parseInt(url.searchParams.get("days") || "30", 10);
  const n = Math.min(Math.max(Number.isNaN(raw) ? 30 : raw, 1), 90);
  const end = resolveDay(url.searchParams.get("end"));
  if (!end) {
    return Response.json({ error: "end must be YYYY-MM-DD." }, { status: 400 });
  }

  const days = await loadDays(addDays(end, -(n - 1)), end);
  const { scores, aiError } = await scoreDays(days);

  const rows = days
    .map((d) => ({
      date: d.date,
      missionTitle: d.mission?.title ?? null,
      missionDone: d.mission?.status === "completed",
      tasksDone: d.stats.tasksDone,
      tasksTotal: d.stats.tasksTotal,
      focusMinutes: d.stats.focusMinutes,
      sessionsCompleted: d.stats.sessionsCompleted,
      score: scores[d.date] ?? null,
    }))
    .reverse();

  const scored = rows.filter((r) => r.score && (r.tasksTotal || r.focusMinutes || r.missionTitle || r.score.score > 0));
  return Response.json({
    start: days[0].date,
    end,
    aiError,
    totals: {
      tasksDone: rows.reduce((s, r) => s + r.tasksDone, 0),
      focusMinutes: rows.reduce((s, r) => s + r.focusMinutes, 0),
      activeDays: rows.filter((r) => r.tasksDone || r.focusMinutes || r.missionTitle).length,
      // Average over days that had any activity, so empty days don't drag it to 0.
      avgScore: scored.length
        ? Math.round(scored.reduce((s, r) => s + r.score!.score, 0) / scored.length)
        : null,
    },
    days: rows,
  });
}
