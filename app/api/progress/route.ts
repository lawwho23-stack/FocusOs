import { db } from "@/lib/db";
import { dayToDate } from "@/lib/day";

// GET /api/progress?days=7 — one aggregate per day, oldest first.
// Each day: mission status, task counts, completed focus minutes,
// and whether a reflection exists. Powers the week strip on the dashboard.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = parseInt(url.searchParams.get("days") || "7", 10);
  const days = Math.min(Math.max(Number.isNaN(raw) ? 7 : raw, 1), 30);

  const now = new Date();
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    keys.push(`${d.getFullYear()}-${m}-${dd}`);
  }

  const [missions, reflections] = await Promise.all([
    db.dailyMission.findMany({
      where: { missionDate: { gte: dayToDate(keys[0]) } },
      include: { tasks: { include: { sessions: true } } },
    }),
    db.reflection.findMany({
      where: { reflectionDate: { gte: dayToDate(keys[0]) } },
      select: { reflectionDate: true },
    }),
  ]);

  // DATE columns arrive as midnight UTC, so the ISO slice is the exact day.
  const byDay = new Map(missions.map((m) => [m.missionDate.toISOString().slice(0, 10), m]));
  const reflectedDays = new Set(
    reflections.map((r) => r.reflectionDate.toISOString().slice(0, 10))
  );

  return Response.json(
    keys.map((date) => {
      const m = byDay.get(date);
      const tasks = m?.tasks ?? [];
      const focusMinutes = tasks
        .flatMap((t) => t.sessions)
        .filter((s) => s.status === "completed" && s.actualMinutes !== null)
        .reduce((sum, s) => sum + (s.actualMinutes ?? 0), 0);
      return {
        date,
        hasMission: !!m,
        missionDone: m?.status === "completed",
        tasksDone: tasks.filter((t) => t.status === "completed").length,
        tasksTotal: tasks.length,
        focusMinutes,
        reflected: reflectedDays.has(date),
      };
    })
  );
}
