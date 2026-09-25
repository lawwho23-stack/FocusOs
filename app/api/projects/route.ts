import { db } from "@/lib/db";

// GET /api/projects — list all projects, newest first.
export async function GET() {
  const projects = await db.project.findMany({
    orderBy: { createdAt: "desc" },
  });
  return Response.json(projects);
}

// POST /api/projects — create a project.
// Body: { name, description?, status?, priority? }
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return Response.json({ error: "Name is required." }, { status: 400 });
  }
  const project = await db.project.create({
    data: {
      name,
      description: body.description ?? null,
      status: body.status ?? "active",
      priority: body.priority ?? "medium",
    },
  });
  return Response.json(project, { status: 201 });
}
