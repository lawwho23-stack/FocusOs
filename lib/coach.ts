import { OpenRouter } from "@openrouter/sdk";
import { choice, noul, score, TypeSafeClient } from "@typesafe-ai/sdk";
import { hasReflection, type DayData } from "@/lib/day-stats";

// AI Coach, in three layers:
//   1. Code computes every number (lib/day-stats.ts). The AI never counts.
//   2. Jev (TypeSafe System One, via OpenRouter) makes typed judgments on
//      the free text: how the day went, what ate the time, recurring blockers.
//   3. A chat model on OpenRouter writes the short message from 1 + 2.
// One key (OPENROUTER_API_KEY) pays for both AI calls.

export type Coach = {
  summary: string;
  wins: string[];
  patterns: string[];
  lostTime: string;
  nextAction: string;
};

export type Judgments = {
  dayQuality: { score: number; confidence: number; label: string };
  mainLeak: { choice: string; confidence: number; probability: number };
  recurringBlocker: number; // probability of yes
} | null;

export type CoachRecord = {
  coach: Coach;
  judgments: Judgments;
  generatedAt: string;
  model: string;
};

const OPENROUTER_BASE = "https://openrouter.ai/api";
const DEFAULT_WRITER = "deepseek/deepseek-v4-flash-0731";

export function coachConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

// One day as the AI sees it: numbers and Laww's own words, nothing else.
// Shared by the coach and the Progress scores so both judge the same facts.
export function dayView(d: DayData) {
  return {
    date: d.date,
    mission: d.mission
      ? {
          title: d.mission.title,
          status: d.mission.status,
          doneMeans: d.mission.successDefinition,
          availableMinutes: d.mission.availableMinutes,
        }
      : null,
    tasks: (d.mission?.tasks ?? []).map((t) => ({
      title: t.title,
      status: t.status,
      estimatedMinutes: t.estimatedMinutes,
    })),
    numbers: d.stats,
    sessionNotes: d.sessions
      .map((s) => s.outcome ?? s.interruptionNote)
      .filter((x): x is string => !!x),
    reflection: hasReflection(d.reflection) && d.reflection
      ? {
          completedWork: d.reflection.completedWork,
          blockers: d.reflection.blockers,
          distractions: d.reflection.distractions,
          lesson: d.reflection.lesson,
          nextStartAction: d.reflection.nextStartAction,
        }
      : null,
    note: d.note?.content ?? null,
  };
}

// What the AI sees: numbers and Laww's own words, nothing else.
// Days are oldest first; the last one is the day being coached.
export function buildCoachState(days: DayData[]) {
  const view = dayView;
  const focus = days[days.length - 1];
  const previous = days.slice(0, -1);
  const withData = previous.filter(
    (d) =>
      d.mission || d.sessions.length || hasReflection(d.reflection) || d.note
  );
  return {
    focus_day: view(focus),
    previous_7_days: previous.map(view),
    previous_7_days_totals: {
      daysWithAnyRecord: withData.length,
      focusMinutes: previous.reduce((n, d) => n + d.stats.focusMinutes, 0),
      tasksDone: previous.reduce((n, d) => n + d.stats.tasksDone, 0),
      tasksTotal: previous.reduce((n, d) => n + d.stats.tasksTotal, 0),
      minutesLostReported: previous.reduce(
        (n, d) => n + (d.stats.minutesLost ?? 0),
        0
      ),
    },
  };
}

type CoachState = ReturnType<typeof buildCoachState>;

const LEAKS = {
  phone_social:
    "Phone, social media, videos, games or other entertainment pulled attention away.",
  low_energy: "Tiredness, low energy, poor sleep, illness or low mood.",
  unclear_plan:
    "No clear next step, a vague mission, or procrastinating on starting.",
  too_big: "Tasks were too large or over-planned for the time available.",
  external:
    "Other people, errands, obligations or outside events took the time.",
  none: "No time loss is recorded, or there is not enough information to tell.",
} as const;

export const QUALITY = [
  "No meaningful work: no mission, or no task done and no focus time.",
  "Some motion: a little focus time or a small task done, but the main mission did not move forward.",
  "Solid: the main mission moved forward with real focus time, though part of the plan was left undone.",
  "Strong: the mission was completed or every planned task was done, backed by focus time.",
] as const;

// Layer 2: typed judgments from Jev. All three questions run in parallel
// in one request. Returns null on failure — the coach still works without.
async function judge(state: CoachState): Promise<Judgments> {
  const client = new TypeSafeClient({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: OPENROUTER_BASE,
  });
  try {
    const res = await client.systemOne({
      model: "jev-latest",
      state,
      questions: {
        dayQuality: score(
          "How productive was `focus_day`, judged against its own mission, tasks and `focus_day.numbers`?",
          QUALITY
        ),
        mainLeak: choice(
          "Using `focus_day.reflection` (distractions, blockers), `focus_day.note`, `focus_day.sessionNotes`, `focus_day.numbers.minutesLost` and `focus_day.numbers.sessionsInterrupted`, what was the main cause of lost time on `focus_day`?",
          LEAKS
        ),
        recurringBlocker: noul(
          "Across `focus_day` and `previous_7_days`, does the same distraction or blocker appear in the reflections or notes on two or more different days?",
          {
            true: "The same distraction or blocker is written on at least two different days.",
            false: "No distraction or blocker repeats across days, or there is too little written to tell.",
          }
        ),
      },
    });
    const a = res.answers;
    const level = Math.min(QUALITY.length - 1, Math.round(a.dayQuality.score));
    return {
      dayQuality: {
        score: Math.round(a.dayQuality.score * 100) / 100,
        confidence: a.dayQuality.confidence,
        label: QUALITY[level],
      },
      mainLeak: {
        choice: a.mainLeak.choice,
        confidence: a.mainLeak.confidence,
        probability: a.mainLeak.probabilities[a.mainLeak.choice],
      },
      recurringBlocker: a.recurringBlocker.noul,
    };
  } catch (e) {
    console.error("Jev judgment failed:", e);
    return null;
  }
}

const SYSTEM = `You are FocusOS Coach, a direct, warm productivity coach for one person.
You receive their tracked data as JSON: computed numbers, their own written reflections and notes, and typed judgments from a classifier model.

Rules:
- Use ONLY the numbers in the data. Never invent, estimate or round a figure differently. If a number is null or missing, say it was not recorded.
- "Lost time" comes only from numbers.minutesLost (self-reported), sessionsInterrupted, the gap between plannedMinutes and focusMinutes, and their written distractions. Never guess a minutes-lost figure.
- The judgments are probabilities, not facts. If a judgment's confidence or probability is below 0.6, phrase it as "likely" or leave it out.
- Talk to them as "you". Short sentences. Plain English. No emojis. No generic advice that ignores their data.
- Compare the focus day with the previous 7 days only when the numbers support it.
- nextAction: one concrete, small first step (about 10-25 minutes) for their next session, built from their own nextStartAction, open tasks or mission when available.

Return ONLY a JSON object with exactly these keys:
{"summary": string (2-3 sentences), "wins": string[] (0-3 items), "patterns": string[] (0-3 items), "lostTime": string (1-2 sentences), "nextAction": string (1 sentence)}`;

function isCoach(x: unknown): x is Coach {
  if (!x || typeof x !== "object") return false;
  const c = x as Record<string, unknown>;
  const strs = (v: unknown) =>
    Array.isArray(v) && v.every((s) => typeof s === "string");
  return (
    typeof c.summary === "string" &&
    strs(c.wins) &&
    strs(c.patterns) &&
    typeof c.lostTime === "string" &&
    typeof c.nextAction === "string"
  );
}

// Models sometimes wrap JSON in ```json fences or add a sentence around it.
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// Layer 3: the writer.
async function write(state: CoachState, judgments: Judgments) {
  const model = process.env.COACH_MODEL || DEFAULT_WRITER;
  const openRouter = new OpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    appTitle: "FocusOS",
  });
  const res = await openRouter.chat.send({
    chatRequest: {
      model,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: JSON.stringify({ data: state, judgments }, null, 1),
        },
      ],
      responseFormat: { type: "json_object" },
      // Reasoning models spend maxTokens on thinking first. With 8 days of
      // data DeepSeek used 1,182 of 1,200 tokens thinking and returned no
      // answer. Low effort is enough (the numbers are precomputed), and the
      // ceiling leaves room for the JSON either way.
      reasoning: { effort: "low" },
      // Several hosts serve DeepSeek; the slow ones took 40-90s. Prefer the
      // fastest so a call stays well under Vercel's 60s limit.
      provider: { sort: "throughput" },
      maxTokens: 8000,
      temperature: 0.4,
      stream: false,
    },
  });
  if (!("choices" in res)) throw new Error("Unexpected streamed response.");
  if (res.choices[0]?.finishReason === "length") {
    throw new Error("The coach model ran out of room before answering. Try again.");
  }
  const content = res.choices[0]?.message?.content;
  const text =
    typeof content === "string"
      ? content
      : (content ?? [])
          .map((p) => ("text" in p && typeof p.text === "string" ? p.text : ""))
          .join("");
  const parsed = extractJson(text);
  if (!isCoach(parsed)) {
    throw new Error("The coach model returned an unreadable answer. Try again.");
  }
  return { coach: parsed, model: res.model ?? model };
}

export async function runCoach(days: DayData[]): Promise<CoachRecord> {
  const state = buildCoachState(days);
  const judgments = await judge(state);
  const { coach, model } = await write(state, judgments);
  return { coach, judgments, generatedAt: new Date().toISOString(), model };
}

// ---------------------------------------------------------------------------
// Follow-up chat. Same data as the report, plus the report itself, so the
// answers stay consistent with it. Plain text out; no Jev call per message.

export type ChatTurn = { role: "user" | "assistant"; content: string };

const CHAT_SYSTEM = `You are FocusOS Coach, a direct, warm productivity coach for one person, chatting inside their dashboard.
You get their tracked data as JSON (computed numbers, their own reflections and notes, classifier judgments) and the coach report you already gave them.

Rules:
- Answer from the data only. Never invent, estimate or re-count a number; quote the numbers as given. If the data can't answer, say what is missing and how they could track it.
- Judgments are probabilities, not facts; below 0.6, say "likely" or leave them out.
- Reply in simple English, even if they write in Burmese or mixed Burmese-English.
- Never show raw field names (like minutesLost or sessionsInterrupted); say them in plain words ("minutes lost", "interrupted sessions").
- Short: 2-6 sentences, or a short list when listing. No emojis. No markdown headings.
- End with one concrete small step when it helps.`;

export async function chatCoach(
  days: DayData[],
  report: CoachRecord | null,
  turns: ChatTurn[]
): Promise<string> {
  const model = process.env.COACH_MODEL || DEFAULT_WRITER;
  const openRouter = new OpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    appTitle: "FocusOS",
  });
  const context = JSON.stringify(
    {
      data: buildCoachState(days),
      report: report ? { coach: report.coach, judgments: report.judgments } : null,
    },
    null,
    1
  );
  const res = await openRouter.chat.send({
    chatRequest: {
      model,
      messages: [
        { role: "system", content: CHAT_SYSTEM },
        { role: "system", content: "Their data:\n" + context },
        ...turns.map((t) =>
          t.role === "user"
            ? { role: "user" as const, content: t.content }
            : { role: "assistant" as const, content: t.content }
        ),
      ],
      // Chat replies explain precomputed numbers, so no thinking step is
      // needed; with the fastest host this answers in 1-2s instead of 40-90s.
      reasoning: { effort: "none" },
      provider: { sort: "throughput" },
      maxTokens: 6000,
      temperature: 0.5,
      stream: false,
    },
  });
  if (!("choices" in res)) throw new Error("Unexpected streamed response.");
  const choice = res.choices[0];
  if (choice?.finishReason === "length") {
    throw new Error("The coach ran out of room before answering. Ask a shorter question.");
  }
  const content = choice?.message?.content;
  const text =
    typeof content === "string"
      ? content
      : (content ?? [])
          .map((p) => ("text" in p && typeof p.text === "string" ? p.text : ""))
          .join("");
  if (!text.trim()) throw new Error("The coach returned an empty answer. Try again.");
  return text.trim();
}
