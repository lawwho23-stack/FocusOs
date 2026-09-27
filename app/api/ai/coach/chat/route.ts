import { after } from "next/server";
import { db } from "@/lib/db";
import { addDays, dayToDate, isValidDateString, resolveDay } from "@/lib/day";
import { loadDays } from "@/lib/day-stats";
import { chatCoach, coachConfigured, type CoachRecord } from "@/lib/coach";
import { gatherBackground, syncAfterReply } from "@/lib/ai/context";
import { clearSummary, extractMemories, getSummary, updateSummary } from "@/lib/ai/memory";
import { cacheConfigured, cacheLookup, cacheStore, isGeneralQuestion } from "@/lib/ai/cache";

export const maxDuration = 60;

// Only the latest turns go to the model; the whole thread stays saved.
// Turns older than that live on as a summary in Redis (short-term memory).
const CONTEXT_TURNS = 20;
const MAX_CHARS = 2000;

// One chat thread per day, saved in CoachMessage until Reset.

// GET /api/ai/coach/chat?date=YYYY-MM-DD — the day's thread, oldest first.
export async function GET(req: Request) {
  const day = resolveDay(new URL(req.url).searchParams.get("date"));
  if (!day) {
    return Response.json({ error: "date must be YYYY-MM-DD." }, { status: 400 });
  }
  const messages = await db.coachMessage.findMany({
    where: { chatDate: dayToDate(day) },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, createdAt: true },
  });
  return Response.json(messages);
}

// Swallows errors from optional Redis/LangCache steps: they never block a reply.
async function optional<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    console.error(`Coach ${label} failed, continuing without:`, e);
    return null;
  }
}

// POST /api/ai/coach/chat — body { date, message }. The history comes from
// the database, not the browser. The question and the answer are saved
// together, only after a good answer; a failed call saves nothing.
//
// Order: LangCache (general questions only) -> short-term summary ->
// long-term memories + past days (Redis) -> LLM -> save -> learn (after reply).
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || !isValidDateString(body.date)) {
    return Response.json({ error: "date must be YYYY-MM-DD." }, { status: 400 });
  }
  const message =
    typeof body.message === "string" ? body.message.trim().slice(0, MAX_CHARS) : "";
  if (!message) {
    return Response.json({ error: "message is required." }, { status: 400 });
  }
  if (!coachConfigured()) {
    return Response.json(
      { error: "Coach not configured: add OPENROUTER_API_KEY to .env (and to Vercel)." },
      { status: 503 }
    );
  }

  const date: string = body.date;
  const chatDate = dayToDate(date);

  // 1. LangCache: a general question asked before gets the saved answer.
  const general = cacheConfigured()
    ? await optional("cache check", () => isGeneralQuestion(message))
    : null;
  let reply = general ? await optional("cache lookup", () => cacheLookup(message)) : null;
  const cached = reply !== null;

  if (!cached) {
    // One after another, not in parallel: the database allows one connection.
    const r = await db.reflection.findUnique({
      where: { reflectionDate: chatDate },
      select: { aiSummary: true },
    });
    const history = await db.coachMessage.findMany({
      where: { chatDate },
      orderBy: { createdAt: "desc" },
      take: CONTEXT_TURNS - 1,
      select: { role: true, content: true },
    });
    let report: CoachRecord | null = null;
    try {
      report = r?.aiSummary ? (JSON.parse(r.aiSummary) as CoachRecord) : null;
    } catch {
      report = null;
    }
    const turns = [...history.reverse(), { role: "user" as const, content: message }];

    try {
      const days = await loadDays(addDays(date, -7), date);
      // 2-4. Short-term summary, long-term memories, past days.
      const bg = await gatherBackground(date, message);
      const summary = await optional("summary read", () => getSummary(date));
      reply = await chatCoach(days, report, turns, {
        memories: bg.memories,
        pastDays: bg.pastDays,
        knowledge: bg.knowledge,
        summary: summary?.text ?? null,
      });
    } catch (e) {
      console.error("Coach chat failed:", e);
      return Response.json(
        { error: e instanceof Error ? e.message : "Coach failed. Try again." },
        { status: 502 }
      );
    }
  }
  const answer = reply!;

  // Answer 1 ms after the question, so the order is stable on reload.
  const now = Date.now();
  const [q, a] = await db.$transaction([
    db.coachMessage.create({
      data: { chatDate, role: "user", content: message, createdAt: new Date(now) },
      select: { id: true, role: true, content: true, createdAt: true },
    }),
    db.coachMessage.create({
      data: { chatDate, role: "assistant", content: answer, createdAt: new Date(now + 1) },
      select: { id: true, role: true, content: true, createdAt: true },
    }),
  ]);

  // 5. Learn, after the reply is sent, so the chat is not slower.
  after(async () => {
    if (general && !cached) await optional("cache store", () => cacheStore(message, answer));
    if (cached) return; // nothing new was said
    await syncAfterReply(date);
    await optional("memory extraction", () =>
      extractMemories({ date, question: message, answer })
    );
    // Turns that no longer fit in the prompt window -> summary.
    const all = await db.coachMessage.findMany({
      where: { chatDate },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true },
    });
    const older = all.slice(0, Math.max(0, all.length - (CONTEXT_TURNS - 1)));
    if (older.length) await optional("summary update", () => updateSummary(date, older));
  });

  return Response.json({ question: q, answer: a, cached });
}

// DELETE /api/ai/coach/chat?date=YYYY-MM-DD — Reset: clear the day's thread
// and its short-term summary. Long-term memories and the report are kept.
export async function DELETE(req: Request) {
  const day = resolveDay(new URL(req.url).searchParams.get("date"));
  if (!day || !isValidDateString(day)) {
    return Response.json({ error: "date must be YYYY-MM-DD." }, { status: 400 });
  }
  const { count } = await db.coachMessage.deleteMany({
    where: { chatDate: dayToDate(day) },
  });
  await optional("summary clear", () => clearSummary(day));
  return Response.json({ deleted: count, date: day });
}
