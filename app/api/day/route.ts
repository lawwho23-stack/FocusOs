import { resolveDay } from "@/lib/day";
import { loadDays } from "@/lib/day-stats";

// GET /api/day?date=YYYY-MM-DD — everything for one day: the mission
// (with tasks and their sessions), every focus session started that day
// (quick-start ones included), the reflection, the note, and the numbers.
// Always 200: an empty day is data too.
export async function GET(req: Request) {
  const day = resolveDay(new URL(req.url).searchParams.get("date"));
  if (!day) {
    return Response.json({ error: "date must be YYYY-MM-DD." }, { status: 400 });
  }
  const [data] = await loadDays(day, day);
  return Response.json(data);
}
