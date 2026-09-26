import { db } from "@/lib/db";
import { addDays, dayToDate, isValidDateString, resolveDay } from "@/lib/day";
import { loadDays } from "@/lib/day-stats";
import { coachConfigured, runCoach, type CoachRecord } from "@/lib/coach";

// Two AI calls in a row (Jev, then the writer) can take a while.
export const maxDuration = 60;

// The coach's answer is saved as JSON in Reflection.aiSummary for the day,
// so revisiting a day costs nothing. Only POST calls the AI.

function readSaved(aiSummary: string | null | undefined): CoachRecord | null {
  if (!aiSummary) return null;
  try {
    return JSON.parse(aiSummary) as CoachRecord;
  } catch {
    return null; // an old plain-text summary: treat as not generated
  }
}

// GET /api/ai/coach?date=YYYY-MM-DD — the saved answer, 404 when none.
export async function GET(req: Request) {
  const day = resolveDay(new URL(req.url).searchParams.get("date"));
  if (!day) {
    return Response.json({ error: "date must be YYYY-MM-DD." }, { status: 400 });
  }
  const r = await db.reflection.findUnique({
    where: { reflectionDate: dayToDate(day) },
    select: { aiSummary: true },
  });
  const saved = readSaved(r?.aiSummary);
  if (!saved) {
    return Response.json({ error: "No coach answer yet.", date: day }, { status: 404 });
  }
  return Response.json(saved);
}

// POST /api/ai/coach — body { date, regenerate? }. Returns the saved answer
// unless regenerate is true; otherwise coaches the day + the 7 before it.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || !isValidDateString(body.date)) {
    return Response.json({ error: "date must be YYYY-MM-DD." }, { status: 400 });
  }
  const date: string = body.date;
  const where = { reflectionDate: dayToDate(date) };

  if (body.regenerate !== true) {
    const r = await db.reflection.findUnique({ where, select: { aiSummary: true } });
    const saved = readSaved(r?.aiSummary);
    if (saved) return Response.json(saved);
  }
  if (!coachConfigured()) {
    return Response.json(
      { error: "Coach not configured: add OPENROUTER_API_KEY to .env (and to Vercel)." },
      { status: 503 }
    );
  }

  let record: CoachRecord;
  try {
    record = await runCoach(await loadDays(addDays(date, -7), date));
  } catch (e) {
    console.error("Coach failed:", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "Coach failed. Try again." },
      { status: 502 }
    );
  }

  // Saved only after a good answer. A day without a reflection gets an
  // empty row holding just the coach answer.
  const aiSummary = JSON.stringify(record);
  await db.reflection.upsert({
    where,
    create: { ...where, aiSummary },
    update: { aiSummary },
  });
  return Response.json(record);
}
