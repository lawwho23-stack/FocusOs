import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { parsePlanningIdea } from "@/lib/planning-ideas";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = parsePlanningIdea(await req.json().catch(() => null), "update");
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
  try {
    const idea = await db.planningIdea.update({ where: { id }, data: parsed.data });
    return Response.json(idea);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return Response.json({ error: "Idea not found." }, { status: 404 });
    }
    return Response.json({ error: "Could not update your idea. Please try again." }, { status: 500 });
  }
}
