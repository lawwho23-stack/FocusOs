import { db } from "@/lib/db";
import { parseLifeMission } from "@/lib/life-missions";

export async function GET() {
  try {
    const missions = await db.lifeMission.findMany({ orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
    return Response.json(missions);
  } catch (error) {
    console.error("GET /api/life-missions failed:", error);
    return Response.json({ error: "Could not load missions. Please try again." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const parsed = parseLifeMission(await req.json().catch(() => null));
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
  try {
    const mission = await db.lifeMission.create({ data: parsed.data });
    return Response.json(mission, { status: 201 });
  } catch (error) {
    console.error("POST /api/life-missions failed:", error);
    return Response.json({ error: "Could not save your mission. Your draft is still here; please try again." }, { status: 500 });
  }
}
