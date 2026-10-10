import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { parseLifeMission } from "@/lib/life-missions";

type Context = { params: Promise<{ id: string }> };
const isMissing = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";

export async function GET(_req: Request, { params }: Context) {
  const { id } = await params;
  try {
    const mission = await db.lifeMission.findUnique({ where: { id } });
    return mission ? Response.json(mission) : Response.json({ error: "Mission not found. Your draft is kept." }, { status: 404 });
  } catch {
    return Response.json({ error: "Could not load the saved mission. Your draft is kept; please try again." }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Context) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = parseLifeMission(body);
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
  const version = body.expectedUpdatedAt;
  if (typeof version !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(version) || Number.isNaN(Date.parse(version))) {
    return Response.json({ error: "The saved mission version is required. Reload and try again." }, { status: 400 });
  }
  try {
    const mission = await db.lifeMission.update({
      where: { id, updatedAt: new Date(version) }, data: parsed.data,
    });
    return Response.json(mission);
  } catch (error) {
    if (isMissing(error)) {
      try {
        const existing = await db.lifeMission.findUnique({ where: { id }, select: { id: true } });
        return Response.json({ error: existing
          ? "This mission changed in another tab. Your draft is kept; review the saved version before saving again."
          : "Mission not found. Your draft is kept." }, { status: existing ? 409 : 404 });
      } catch { /* A failed conflict lookup is still a database outage. */ }
    }
    return Response.json({ error: "Could not update your mission. Your draft is still here; please try again." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Context) {
  const { id } = await params;
  try {
    await db.lifeMission.delete({ where: { id } });
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json({ error: isMissing(error) ? "Mission not found." : "Could not delete your mission. Please try again." }, { status: isMissing(error) ? 404 : 500 });
  }
}
