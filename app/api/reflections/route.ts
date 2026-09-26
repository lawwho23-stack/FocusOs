import { db } from "@/lib/db";
import { dayToDate, isValidDateString, resolveDay } from "@/lib/day";

// GET /api/reflections?date=YYYY-MM-DD — one reflection, 404 when none.
// GET /api/reflections?recent=7 — last N reflections (max 90), newest first.
//   &before=YYYY-MM-DD — only days before that one ("load more" paging).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const recent = url.searchParams.get("recent");
  if (recent !== null) {
    const n = Math.min(Math.max(parseInt(recent || "7", 10) || 7, 1), 90);
    const before = url.searchParams.get("before");
    if (before !== null && !isValidDateString(before)) {
      return Response.json(
        { error: "before must be YYYY-MM-DD." },
        { status: 400 }
      );
    }
    const list = await db.reflection.findMany({
      where: before ? { reflectionDate: { lt: dayToDate(before) } } : undefined,
      orderBy: { reflectionDate: "desc" },
      take: n,
    });
    return Response.json(list);
  }
  const day = resolveDay(url.searchParams.get("date"));
  if (!day) {
    return Response.json({ error: "date must be YYYY-MM-DD." }, { status: 400 });
  }
  const reflection = await db.reflection.findUnique({
    where: { reflectionDate: dayToDate(day) },
  });
  if (!reflection) {
    return Response.json(
      { error: "No reflection for this date.", date: day },
      { status: 404 }
    );
  }
  return Response.json(reflection);
}

// POST /api/reflections — save today's reflection (upsert by date).
// Saving twice updates instead of duplicating, so a double submit
// or an evening edit never creates two rows for one day.
// Body: { reflectionDate? (default today), completedWork?, blockers?,
//         distractions?, energyLevel? (1-5), lesson?, nextStartAction?,
//         minutesLost? (0-1440) }
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Body is required." }, { status: 400 });
  }
  const day =
    body.reflectionDate === undefined
      ? resolveDay(null)
      : body.reflectionDate;
  if (!day || typeof day !== "string") {
    return Response.json(
      { error: "reflectionDate must be YYYY-MM-DD." },
      { status: 400 }
    );
  }
  if (!isValidDateString(day)) {
    return Response.json(
      { error: "reflectionDate must be YYYY-MM-DD." },
      { status: 400 }
    );
  }
  if (
    body.energyLevel !== undefined &&
    body.energyLevel !== null &&
    (!Number.isInteger(body.energyLevel) ||
      body.energyLevel < 1 ||
      body.energyLevel > 5)
  ) {
    return Response.json(
      { error: "energyLevel must be 1-5." },
      { status: 400 }
    );
  }
  if (
    body.minutesLost !== undefined &&
    body.minutesLost !== null &&
    (!Number.isInteger(body.minutesLost) ||
      body.minutesLost < 0 ||
      body.minutesLost > 1440)
  ) {
    return Response.json(
      { error: "minutesLost must be 0-1440." },
      { status: 400 }
    );
  }
  const reflection = await db.reflection.upsert({
    where: { reflectionDate: dayToDate(day) },
    create: {
      reflectionDate: dayToDate(day),
      completedWork: body.completedWork ?? null,
      blockers: body.blockers ?? null,
      distractions: body.distractions ?? null,
      energyLevel: body.energyLevel ?? null,
      lesson: body.lesson ?? null,
      nextStartAction: body.nextStartAction ?? null,
      minutesLost: body.minutesLost ?? null,
    },
    update: {
      ...(body.completedWork !== undefined
        ? { completedWork: body.completedWork }
        : {}),
      ...(body.blockers !== undefined ? { blockers: body.blockers } : {}),
      ...(body.distractions !== undefined
        ? { distractions: body.distractions }
        : {}),
      ...(body.energyLevel !== undefined
        ? { energyLevel: body.energyLevel }
        : {}),
      ...(body.lesson !== undefined ? { lesson: body.lesson } : {}),
      ...(body.nextStartAction !== undefined
        ? { nextStartAction: body.nextStartAction }
        : {}),
      ...(body.minutesLost !== undefined
        ? { minutesLost: body.minutesLost }
        : {}),
    },
  });
  return Response.json(reflection);
}
