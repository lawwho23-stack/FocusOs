import { db } from "@/lib/db";
import { dayToDate, isValidDateString, resolveDay } from "@/lib/day";

// GET /api/notes?date=YYYY-MM-DD — the day's note, 404 when none.
export async function GET(req: Request) {
  const day = resolveDay(new URL(req.url).searchParams.get("date"));
  if (!day) {
    return Response.json({ error: "date must be YYYY-MM-DD." }, { status: 400 });
  }
  const note = await db.dailyNote.findUnique({
    where: { noteDate: dayToDate(day) },
  });
  if (!note) {
    return Response.json(
      { error: "No note for this date.", date: day },
      { status: 404 }
    );
  }
  return Response.json(note);
}

// POST /api/notes — save one day's note (upsert by date, like reflections).
// Body: { noteDate (YYYY-MM-DD), content }. Empty content deletes the note.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || !isValidDateString(body.noteDate)) {
    return Response.json(
      { error: "noteDate must be YYYY-MM-DD." },
      { status: 400 }
    );
  }
  if (typeof body.content !== "string") {
    return Response.json({ error: "content must be text." }, { status: 400 });
  }
  const noteDate = dayToDate(body.noteDate);
  const content = body.content.trim();
  if (!content) {
    await db.dailyNote.deleteMany({ where: { noteDate } });
    return Response.json({ deleted: true, date: body.noteDate });
  }
  const note = await db.dailyNote.upsert({
    where: { noteDate },
    create: { noteDate, content },
    update: { content },
  });
  return Response.json(note);
}
