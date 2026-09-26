import { db } from "@/lib/db";
import { addDays, dayBounds, instantToDay, resolveDay } from "@/lib/day";

// GET /api/focus-sessions?days=30&end=YYYY-MM-DD — focus history.
// Every session started in the range (Laww's local days), grouped by day,
// newest day first. Only days with at least one session are returned.
// Minutes count completed sessions only, same rule as lib/day-stats.ts.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = parseInt(url.searchParams.get("days") || "30", 10);
  const days = Math.min(Math.max(Number.isNaN(raw) ? 30 : raw, 1), 366);
  const end = resolveDay(url.searchParams.get("end"));
  if (!end) {
    return Response.json({ error: "end must be YYYY-MM-DD." }, { status: 400 });
  }
  const start = addDays(end, -(days - 1));

  const sessions = await db.focusSession.findMany({
    where: { startedAt: { gte: dayBounds(start).gte, lt: dayBounds(end).lt } },
    include: { task: { select: { title: true } } },
    orderBy: { startedAt: "desc" },
  });

  const byDay = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const day = instantToDay(s.startedAt);
    byDay.set(day, [...(byDay.get(day) ?? []), s]);
  }
  const list = [...byDay.entries()].map(([date, list]) => {
    const completed = list.filter((s) => s.status === "completed");
    return {
      date,
      focusMinutes: completed.reduce((n, s) => n + (s.actualMinutes ?? 0), 0),
      sessionsCompleted: completed.length,
      sessionsInterrupted: list.filter((s) => s.status === "interrupted").length,
      sessions: list,
    };
  });

  return Response.json({
    start,
    end,
    focusMinutes: list.reduce((n, d) => n + d.focusMinutes, 0),
    sessionsCompleted: list.reduce((n, d) => n + d.sessionsCompleted, 0),
    sessionsInterrupted: list.reduce((n, d) => n + d.sessionsInterrupted, 0),
    days: list,
  });
}
