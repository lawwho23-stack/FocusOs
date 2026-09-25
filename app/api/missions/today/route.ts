import { db } from "@/lib/db";
import { dayToDate, resolveDay } from "@/lib/day";

// GET /api/missions/today?date=YYYY-MM-DD — the one mission for a day,
// with tasks (in display order) and their sessions. 404 when none yet.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const day = resolveDay(url.searchParams.get("date"));
  if (!day) {
    return Response.json(
      { error: "date must be YYYY-MM-DD." },
      { status: 400 }
    );
  }
  const mission = await db.dailyMission.findFirst({
    where: { missionDate: dayToDate(day) },
    include: {
      project: true,
      tasks: { orderBy: { orderIndex: "asc" }, include: { sessions: true } },
    },
  });
  if (!mission) {
    return Response.json(
      { error: "No mission for this date.", date: day },
      { status: 404 }
    );
  }
  return Response.json(mission);
}
