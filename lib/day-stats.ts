import { db } from "@/lib/db";
import { addDays, dayBounds, dayToDate, instantToDay } from "@/lib/day";

// Lives in its own db-free file so browser pages can use the same rule.
export { hasReflection } from "@/lib/reflection";

// Everything recorded for a range of days, plus computed numbers per day.
// One source of truth: the day view, the calendar dots and the AI coach
// all read these same numbers, so the coach can never disagree with the UI.
//
// Focus time is counted by when a session STARTED (in Laww's timezone),
// not through mission -> task -> session. That way quick-start sessions
// (no task) count too.

export type DayStats = {
  tasksDone: number;
  tasksTotal: number;
  taskPct: number | null; // null when there were no tasks
  focusMinutes: number; // completed sessions only
  sessionsCompleted: number;
  sessionsInterrupted: number;
  plannedMinutes: number; // planned time of finished (non-running) sessions
  energy: number | null;
  minutesLost: number | null; // self-reported in the reflection
};

export async function loadDays(start: string, end: string) {
  const [missions, sessions, reflections, notes] = await Promise.all([
    db.dailyMission.findMany({
      where: { missionDate: { gte: dayToDate(start), lte: dayToDate(end) } },
      include: {
        project: true,
        tasks: { orderBy: { orderIndex: "asc" }, include: { sessions: true } },
      },
    }),
    db.focusSession.findMany({
      where: {
        startedAt: { gte: dayBounds(start).gte, lt: dayBounds(end).lt },
      },
      include: { task: { select: { title: true } } },
      orderBy: { startedAt: "asc" },
    }),
    db.reflection.findMany({
      where: { reflectionDate: { gte: dayToDate(start), lte: dayToDate(end) } },
    }),
    db.dailyNote.findMany({
      where: { noteDate: { gte: dayToDate(start), lte: dayToDate(end) } },
    }),
  ]);

  // DATE columns arrive as midnight UTC, so the ISO slice is the exact day.
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const missionBy = new Map(missions.map((m) => [key(m.missionDate), m]));
  const reflBy = new Map(reflections.map((r) => [key(r.reflectionDate), r]));
  const noteBy = new Map(notes.map((n) => [key(n.noteDate), n]));

  const days = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const mission = missionBy.get(date) ?? null;
    const reflection = reflBy.get(date) ?? null;
    const daySessions = sessions.filter(
      (s) => instantToDay(s.startedAt) === date
    );
    const tasks = mission?.tasks ?? [];
    const done = tasks.filter((t) => t.status === "completed").length;
    const finished = daySessions.filter((s) => s.status !== "running");
    const completed = daySessions.filter((s) => s.status === "completed");
    const stats: DayStats = {
      tasksDone: done,
      tasksTotal: tasks.length,
      taskPct: tasks.length ? Math.round((done / tasks.length) * 100) : null,
      focusMinutes: completed.reduce((n, s) => n + (s.actualMinutes ?? 0), 0),
      sessionsCompleted: completed.length,
      sessionsInterrupted: daySessions.filter((s) => s.status === "interrupted")
        .length,
      plannedMinutes: finished.reduce((n, s) => n + s.plannedMinutes, 0),
      energy: reflection?.energyLevel ?? null,
      minutesLost: reflection?.minutesLost ?? null,
    };
    days.push({
      date,
      mission,
      sessions: daySessions,
      reflection,
      note: noteBy.get(date) ?? null,
      stats,
    });
  }
  return days;
}

export type DayData = Awaited<ReturnType<typeof loadDays>>[number];
