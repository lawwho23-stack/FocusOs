"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Undo2,
} from "lucide-react";
import CoachWidget from "@/components/coach-widget";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GLASS, HUD, api, isValidDay } from "@/lib/ui";

// Minimal shapes matching the API responses. Kept local on purpose:
// one page, one file, no premature shared-types folder yet.
type Project = { id: string; name: string; status: string; priority: string };
type Session = {
  id: string;
  taskId: string | null;
  startedAt: string;
  plannedMinutes: number;
  actualMinutes: number | null;
  status: string;
  outcome: string | null;
  interruptionNote: string | null;
  task?: { title: string } | null;
};
type Task = {
  id: string;
  title: string;
  status: string;
  estimatedMinutes: number | null;
  sessions: Session[];
};
type Mission = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  availableMinutes: number | null;
  successDefinition: string | null;
  project: Project;
  tasks: Task[];
};
type Reflection = {
  id: string;
  reflectionDate: string;
  completedWork: string | null;
  blockers: string | null;
  distractions: string | null;
  energyLevel: number | null;
  lesson: string | null;
  nextStartAction: string | null;
  minutesLost: number | null;
};
type DayStats = {
  tasksDone: number;
  tasksTotal: number;
  taskPct: number | null;
  focusMinutes: number;
  sessionsCompleted: number;
  sessionsInterrupted: number;
  plannedMinutes: number;
  energy: number | null;
  minutesLost: number | null;
};
// GET /api/day — everything recorded for one date.
type Day = {
  date: string;
  mission: Mission | null;
  sessions: Session[];
  reflection: Reflection | null;
  note: { content: string } | null;
  stats: DayStats;
};
type DayProgress = {
  date: string;
  hasMission: boolean;
  missionDone: boolean;
  tasksDone: number;
  tasksTotal: number;
  focusMinutes: number;
  reflected: boolean;
  hasNote: boolean;
};

// Database DATE values arrive as midnight UTC, so their ISO slice is the
// day. For real instants (Date objects), the browser's own timezone gives
// the calendar day the user lived.
function dayKey(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD
}

const pad = (n: number) => String(n).padStart(2, "0");

// Last day of a month, as YYYY-MM-DD. month is 0-based.
function monthEnd(year: number, month: number): string {
  return `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;
}

// Date-string arithmetic in UTC, so no local timezone can shift the day.
function shiftDay(day: string, n: number): string {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000
  );
}

export default function Home() {
  const [today, setToday] = useState(() => dayKey(new Date()));
  // The day that was clicked. The browser — not the server's clock —
  // decides what "today" is. Writes never use this directly; they use the
  // day that is actually loaded (day.date), see `shownDate` below.
  const [selectedDate, setSelectedDate] = useState(today);
  const selectedRef = useRef(selectedDate);
  const todayRef = useRef(today);
  useEffect(() => {
    selectedRef.current = selectedDate;
  }, [selectedDate]);
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const [project, setProject] = useState<Project | null>(null);
  const [day, setDay] = useState<Day | null>(null);
  const [progress, setProgress] = useState<DayProgress[]>([]);
  const [monthProgress, setMonthProgress] = useState<DayProgress[]>([]);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  // Mission form
  const [mTitle, setMTitle] = useState("");
  const [mMinutes, setMMinutes] = useState("90");
  const [mSuccess, setMSuccess] = useState("");
  // Task form
  const [tTitle, setTTitle] = useState("");
  const [tMinutes, setTMinutes] = useState("25");
  // Focus form
  const [fTaskId, setFTaskId] = useState("");
  const [fMinutes, setFMinutes] = useState("25");
  const [fOutcome, setFOutcome] = useState("");
  // Reflection form
  const [recent, setRecent] = useState<Reflection[]>([]);
  const [rCompleted, setRCompleted] = useState("");
  const [rBlockers, setRBlockers] = useState("");
  const [rDistractions, setRDistractions] = useState("");
  const [rEnergy, setREnergy] = useState("3");
  const [rLesson, setRLesson] = useState("");
  const [rNext, setRNext] = useState("");
  const [rLost, setRLost] = useState("");
  // Which day + reflection the form was prefilled from. Prefill happens
  // once per pair, so refreshes never wipe unsaved typing, and switching
  // days always resets the form (even between two empty days).
  const refilledKey = useRef<string | null>(null);

  // Reads server state without touching React state, so both the
  // initial load (inside an effect) and refreshes can share it.
  // Requests run one after another ON PURPOSE: DATABASE_URL allows a single
  // pooled connection, and parallel requests queue until Prisma times out.
  const fetchState = useCallback(
    async (date: string, calEnd: string) => {
      const d = (await api(`/api/day?date=${date}`)) as Day;
      // One progress call covers both the week strip (7 days ending on the
      // selected day) and the calendar month, when they are close together.
      const weekStart = shiftDay(date, -6);
      const monthStart = calEnd.slice(0, 8) + "01";
      const start = weekStart < monthStart ? weekStart : monthStart;
      const end = date > calEnd ? date : calEnd;
      const span = daysBetween(start, end) + 1;
      let week: DayProgress[];
      let month: DayProgress[];
      if (span <= 42) {
        const all = (await api(
          `/api/progress?days=${span}&end=${end}`
        )) as DayProgress[];
        week = all.filter((x) => x.date >= weekStart && x.date <= date);
        month = all;
      } else {
        week = (await api(`/api/progress?days=7&end=${date}`)) as DayProgress[];
        month = (await api(`/api/progress?days=42&end=${calEnd}`)) as DayProgress[];
      }
      const recentList = (await api("/api/reflections?recent=30")) as Reflection[];
      const list = (await api("/api/projects")) as Project[];
      const active =
        list.find((p) => p.status === "active") ?? list[0] ?? null;
      return { project: active, day: d, recent: recentList, week, month };
    },
    []
  );

  const applyState = useCallback(
    (s: Awaited<ReturnType<typeof fetchState>>) => {
      setProject(s.project);
      setDay(s.day);
      setRecent(s.recent);
      setProgress(s.week);
      setMonthProgress(s.month);
      const r = s.day.reflection;
      const key = `${s.day.date}:${r ? r.id : "none"}`;
      if (refilledKey.current !== key) {
        refilledKey.current = key;
        setRCompleted(r?.completedWork ?? "");
        setRBlockers(r?.blockers ?? "");
        setRDistractions(r?.distractions ?? "");
        setREnergy(r?.energyLevel != null ? String(r.energyLevel) : "3");
        setRLesson(r?.lesson ?? "");
        setRNext(r?.nextStartAction ?? "");
        setRLost(r?.minutesLost != null ? String(r.minutesLost) : "");
      }
    },
    []
  );

  const calEnd = monthEnd(viewMonth.year, viewMonth.month);

  useEffect(() => {
    let active = true;
    fetchState(selectedDate, calEnd).then(
      (s) => {
        if (!active) return;
        setError("");
        applyState(s);
      },
      (e) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Load failed");
      }
    );
    return () => {
      active = false;
    };
  }, [fetchState, applyState, selectedDate, calEnd]);

  // Keep "today" true when the tab stays open past midnight. A viewer who
  // was on today follows it to the new today; a past day stays put.
  useEffect(() => {
    const check = () => {
      const t = dayKey(new Date());
      const prev = todayRef.current;
      if (prev === t) return;
      todayRef.current = t;
      setToday(t);
      if (selectedRef.current === prev) selectDay(t);
    };
    const timer = setInterval(check, 60_000);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, []);

  // Other pages link here as /?date=YYYY-MM-DD to open one day.
  // Read from window once on mount (no useSearchParams, so no Suspense).
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("date");
    if (isValidDay(d) && d !== todayRef.current) selectDay(d);
  }, []);

  function selectDay(date: string) {
    selectedRef.current = date;
    setSelectedDate(date);
    const [y, m] = date.split("-").map(Number);
    setViewMonth({ year: y, month: m - 1 });
  }

  function shiftMonth(delta: number) {
    setViewMonth(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  // The loaded day drives every control and write. While another day is
  // loading, `loading` is true and all save/add buttons are disabled, so
  // nothing can be written to the wrong date.
  const shownDate = day?.date ?? selectedDate;
  const loading = day?.date !== selectedDate;
  const isToday = shownDate === today;
  const mission = day?.mission ?? null;
  const noMission = day !== null && !mission;
  const reflection = day?.reflection ?? null;

  // Ticking clock so the running session shows elapsed time.
  // Display only — real duration is computed by the server on finish.
  const sessions = day?.sessions ?? [];
  const running: Session | null =
    (isToday && sessions.find((s) => s.status === "running")) || null;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(fn: () => Promise<void>) {
    setError("");
    try {
      await fn();
      const s = await fetchState(selectedRef.current, calEnd);
      // A day switch during the refresh wins: never paint an old day.
      if (s.day.date === selectedRef.current) applyState(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  const tasks = mission?.tasks ?? [];
  const openTasks = tasks.filter((t) => t.status !== "completed");
  const completedTasks = tasks.filter((t) => t.status === "completed");
  const elapsedSec = running
    ? Math.max(0, Math.floor((now - new Date(running.startedAt).getTime()) / 1000))
    : 0;
  const elapsedLabel = `${String(Math.floor(elapsedSec / 60)).padStart(2, "0")}:${String(
    elapsedSec % 60
  ).padStart(2, "0")}`;
  const doneMinutes = day?.stats.focusMinutes ?? 0;
  const taskProgress = day?.stats.taskPct ?? 0;

  // Handoff: the newest reflection before the selected day that names a
  // next action (skipped days don't break the chain).
  const handoff =
    recent.find(
      (r) => dayKey(r.reflectionDate) < selectedDate && r.nextStartAction
    ) ?? null;

  const fmtDay = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  // Cards describe the loaded day; the header follows the click instantly.
  const selectedLabel = fmtDay(shownDate);
  const headerLabel = fmtDay(selectedDate);

  // Calendar month grid for the month being viewed.
  const calYear = viewMonth.year;
  const calMonth = viewMonth.month;
  const monthName = new Date(calYear, calMonth, 1).toLocaleDateString(
    undefined,
    { month: "long" }
  );
  const firstDow = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const markedDays = new Set(
    monthProgress
      .filter((d) => d.hasMission || d.reflected || d.hasNote || d.focusMinutes > 0)
      .map((d) => d.date)
  );
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const maxWeekMinutes = Math.max(1, ...progress.map((d) => d.focusMinutes));

  return (
    <>
        {/* Main column */}
        <main className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Hero */}
          <div className="flex flex-col gap-1 lg:col-span-3">
            <p className={HUD + " text-primary"}>
              Space&nbsp;&nbsp;/&nbsp;&nbsp;Gravity&nbsp;&nbsp;/&nbsp;&nbsp;Motion
            </p>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h1 className="font-display text-5xl font-semibold tracking-tight">
                {selectedDate === today ? "Today" : headerLabel}&apos;s{" "}
                <span className="text-primary">orbit</span>
                {loading && day && (
                  <span className={HUD + " ml-3 align-middle"}>loading…</span>
                )}
              </h1>
              {selectedDate !== today && (
                <Button
                  variant="outline"
                  className="border-primary/50 bg-transparent hover:bg-primary/10"
                  onClick={() => selectDay(today)}
                >
                  <Undo2 className="h-4 w-4" />
                  Back to today
                </Button>
              )}
            </div>
            {/* Tagline on the left, day facts pinned to the right */}
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
              <p className="text-sm text-muted-foreground">
                {isToday
                  ? "Small mass moves daily. Consistency builds the universe."
                  : "Looking back. Past days are for review — the reflection stays editable."}
              </p>
              <div className="ml-auto flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4" />
                  {selectedLabel}
                  {isToday && " · today"}
                </span>
                <span className="flex items-center gap-1.5">
                  <Archive className="h-4 w-4" />
                  {day?.stats.sessionsCompleted ?? 0} sessions done
                </span>
              </div>
            </div>
          </div>

          {error && (
            <p className="rounded-2xl bg-destructive/10 px-4 py-2 text-sm text-destructive lg:col-span-3">
              {error}
            </p>
          )}

          {/* Week progress strip */}
          <Card id="progress" className={`lg:col-span-3 ${GLASS}`}>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-xl">
                {isToday ? "This week" : `Week to ${selectedLabel}`}
              </CardTitle>
              <CardDescription className={HUD}>
                Mass curves space
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-2">
                {progress.map((d) => {
                  const isSel = d.date === selectedDate;
                  const label = new Date(d.date + "T00:00:00")
                    .toLocaleDateString(undefined, { weekday: "narrow" });
                  return (
                    <button
                      key={d.date}
                      onClick={() => selectDay(d.date)}
                      title={d.date}
                      className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 transition-colors ${
                        isSel ? "bg-primary/10 ring-1 ring-primary/50" : "bg-white/[0.03] hover:bg-white/[0.06]"
                      }`}
                    >
                      <span className={HUD}>{label}</span>
                      <span className="font-display text-lg font-semibold">
                        {d.focusMinutes}
                      </span>
                      <span className="text-[10px] text-muted-foreground">min</span>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${Math.round((d.focusMinutes / maxWeekMinutes) * 100)}%`,
                          }}
                        />
                      </div>
                      <div className="flex gap-1 pt-0.5">
                        <span
                          title={d.missionDone ? "Mission done" : d.hasMission ? "Mission open" : "No mission"}
                          className={`h-1.5 w-1.5 rounded-full ${
                            d.missionDone
                              ? "bg-primary"
                              : d.hasMission
                                ? "border border-primary"
                                : "bg-white/15"
                          }`}
                        />
                        <span
                          title={d.reflected ? "Reflected" : "No reflection"}
                          className={`h-1.5 w-1.5 rounded-full ${
                            d.reflected ? "bg-foreground/70" : "bg-white/15"
                          }`}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Calendar */}
          <Card className={GLASS}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="font-display text-xl">
                  {monthName} <span className={HUD}>{calYear}</span>
                </CardTitle>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Previous month"
                    className="h-7 w-7 hover:bg-white/5"
                    onClick={() => shiftMonth(-1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Next month"
                    className="h-7 w-7 hover:bg-white/5"
                    onClick={() => shiftMonth(1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                  <span key={i}>
                    {d}
                  </span>
                ))}
                {cells.map((n, i) => {
                  if (n === null) return <span key={i} />;
                  const key = `${calYear}-${pad(calMonth + 1)}-${pad(n)}`;
                  const isTodayCell = key === today;
                  const isSel = key === selectedDate;
                  return (
                    <button
                      key={i}
                      onClick={() => selectDay(key)}
                      aria-label={key}
                      aria-pressed={isSel}
                      className={`flex flex-col items-center rounded-full py-1 text-xs transition-colors ${
                        isTodayCell
                          ? "bg-primary font-semibold text-primary-foreground"
                          : "text-foreground/80 hover:bg-white/10"
                      } ${isSel ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : ""}`}
                    >
                      {n}
                      <span
                        className={`h-1 w-1 rounded-full ${
                          markedDays.has(key) && !isTodayCell
                            ? "bg-primary"
                            : "bg-transparent"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* My day summary */}
          <Card id="my-day" className={GLASS}>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-xl">
                {isToday ? "My day" : selectedLabel}
              </CardTitle>
              <CardDescription className={HUD}>
                {reflection?.energyLevel
                  ? `Energy ${reflection.energyLevel}/5 · ${taskProgress}% tasks`
                  : `${taskProgress}% tasks complete`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="font-display text-lg leading-snug">
                {mission
                  ? mission.title
                  : isToday
                    ? "No mission yet today."
                    : "No mission on this day."}
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${taskProgress}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-white/[0.04] px-2 py-2">
                  <p className="font-display text-xl font-semibold">
                    {completedTasks.length}
                  </p>
                  <p className={HUD}>done</p>
                </div>
                <div className="rounded-xl bg-white/[0.04] px-2 py-2">
                  <p className="font-display text-xl font-semibold">
                    {openTasks.length}
                  </p>
                  <p className={HUD}>open</p>
                </div>
                <div className="rounded-xl bg-white/[0.04] px-2 py-2">
                  <p className="font-display text-xl font-semibold">
                    {doneMinutes}
                  </p>
                  <p className={HUD}>min</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Upcoming tasks */}
          <Card id="tasks" className={GLASS}>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-xl">
                {isToday ? "Upcoming tasks" : "Tasks that day"}
              </CardTitle>
              <CardDescription className={HUD}>
                {mission
                  ? `${completedTasks.length}/${tasks.length} done · tap the box to change.`
                  : isToday
                    ? "Save a mission first."
                    : "No mission that day."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {tasks.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nothing here yet.
                </p>
              )}
              {tasks.map((t) => (
                <button
                  key={t.id}
                  disabled={loading}
                  onClick={() =>
                    mission &&
                    run(async () => {
                      await api(`/api/tasks/${t.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({
                          status: t.status === "completed" ? "todo" : "completed",
                        }),
                      });
                    })
                  }
                  className="flex items-center gap-2.5 rounded-xl px-1 py-1 text-left text-sm hover:bg-white/5"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md border ${
                      t.status === "completed"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-white/25 bg-transparent"
                    }`}
                  >
                    {t.status === "completed" && <Check className="h-3 w-3" />}
                  </span>
                  <span
                    className={
                      t.status === "completed"
                        ? "line-through text-muted-foreground"
                        : ""
                    }
                  >
                    {t.title}
                  </span>
                  {t.estimatedMinutes && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {t.estimatedMinutes}m
                    </span>
                  )}
                </button>
              ))}
              {mission && isToday && (
                <div className="mt-1 flex gap-2">
                  <Input
                    value={tTitle}
                    onChange={(e) => setTTitle(e.target.value)}
                    placeholder="Add one small action…"
                    className="border-white/10 bg-white/[0.04]"
                  />
                  <Input
                    className="w-16 border-white/10 bg-white/[0.04]"
                    type="number"
                    min={1}
                    aria-label="Estimated minutes"
                    value={tMinutes}
                    onChange={(e) => setTMinutes(e.target.value)}
                  />
                  <Button
                    size="icon"
                    aria-label="Add task"
                    disabled={loading}
                    onClick={() =>
                      run(async () => {
                        await api(`/api/missions/${mission.id}/tasks`, {
                          method: "POST",
                          body: JSON.stringify({
                            title: tTitle,
                            estimatedMinutes: Number(tMinutes) || null,
                          }),
                        });
                        setTTitle("");
                      })
                    }
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Mission */}
          <Card className={GLASS}>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-xl">
                {isToday ? "Today\u2019s mission" : "Mission"}
              </CardTitle>
              <CardDescription className={HUD}>One main outcome.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {mission ? (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{mission.title}</p>
                    <Badge>{mission.status}</Badge>
                  </div>
                  {mission.successDefinition && (
                    <p className="text-sm text-muted-foreground">
                      Done means: {mission.successDefinition}
                    </p>
                  )}
                  {mission.status !== "completed" && (
                    <Button
                      variant="outline"
                      className="border-white/15 bg-transparent hover:bg-white/5"
                      onClick={() =>
                        run(async () => {
                          await api(`/api/missions/${mission.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ status: "completed" }),
                          });
                        })
                      }
                    >
                      Mark complete
                    </Button>
                  )}
                </>
              ) : noMission && !isToday ? (
                <p className="text-sm text-muted-foreground">
                  No mission was set on this day.
                </p>
              ) : noMission ? (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="m-title">Main outcome</Label>
                    <Input
                      id="m-title"
                      value={mTitle}
                      onChange={(e) => setMTitle(e.target.value)}
                      placeholder="e.g. Create the FocusOS dashboard"
                      className="border-white/10 bg-white/[0.04]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-2">
                      <Label htmlFor="m-min">Minutes</Label>
                      <Input
                        id="m-min"
                        type="number"
                        min={1}
                        value={mMinutes}
                        onChange={(e) => setMMinutes(e.target.value)}
                        className="border-white/10 bg-white/[0.04]"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="m-done">Done means</Label>
                      <Input
                        id="m-done"
                        value={mSuccess}
                        onChange={(e) => setMSuccess(e.target.value)}
                        placeholder="How you know"
                        className="border-white/10 bg-white/[0.04]"
                      />
                    </div>
                  </div>
                  <Button
                    disabled={loading}
                    onClick={() =>
                      run(async () => {
                        if (!project) throw new Error("No project found.");
                        await api("/api/missions", {
                          method: "POST",
                          body: JSON.stringify({
                            projectId: project.id,
                            missionDate: shownDate,
                            title: mTitle,
                            availableMinutes: Number(mMinutes) || null,
                            successDefinition: mSuccess || null,
                          }),
                        });
                        setMTitle("");
                        setMSuccess("");
                      })
                    }
                  >
                    Save mission
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Loading…</p>
              )}
            </CardContent>
          </Card>

          {/* Focus timer — the gold card */}
          <Card
            id="focus"
            className="border-primary bg-primary text-primary-foreground shadow-xl shadow-primary/20"
          >
            <CardHeader className="pb-2">
              <CardDescription className="text-[11px] uppercase tracking-[0.2em] text-primary-foreground/70">
                {running
                  ? "Focusing now"
                  : isToday
                    ? "Pomodoro timer"
                    : `Focus on ${selectedLabel}`}
              </CardDescription>
              <CardTitle className="font-display text-5xl font-semibold tracking-tight tabular-nums">
                {running
                  ? elapsedLabel
                  : isToday
                    ? `${fMinutes.padStart(2, "0")}:00`
                    : `${doneMinutes} min`}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {running ? (
                <>
                  <p className="text-sm text-primary-foreground/80">
                    {running.plannedMinutes} min planned
                    {running.taskId
                      ? ` · ${tasks.find((t) => t.id === running.taskId)?.title ?? ""}`
                      : ""}
                  </p>
                  <div className="grid gap-2">
                    <Label htmlFor="f-out" className="text-primary-foreground/80">
                      Outcome note
                    </Label>
                    <Textarea
                      id="f-out"
                      value={fOutcome}
                      onChange={(e) => setFOutcome(e.target.value)}
                      placeholder="What happened in this session?"
                      className="border-black/20 bg-black/10 text-primary-foreground placeholder:text-primary-foreground/50"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        run(async () => {
                          await api(
                            `/api/focus-sessions/${running.id}/finish`,
                            {
                              method: "POST",
                              body: JSON.stringify({
                                status: "completed",
                                outcome: fOutcome || null,
                              }),
                            }
                          );
                          setFOutcome("");
                        })
                      }
                    >
                      Finish
                    </Button>
                    <Button
                      variant="outline"
                      className="border-black/25 bg-transparent text-primary-foreground hover:bg-black/10 hover:text-primary-foreground"
                      onClick={() =>
                        run(async () => {
                          await api(
                            `/api/focus-sessions/${running.id}/finish`,
                            {
                              method: "POST",
                              body: JSON.stringify({
                                status: "interrupted",
                                interruptionNote: fOutcome || null,
                              }),
                            }
                          );
                          setFOutcome("");
                        })
                      }
                    >
                      Interrupted
                    </Button>
                  </div>
                </>
              ) : !isToday ? (
                <p className="text-sm text-primary-foreground/80">
                  {day?.stats.sessionsCompleted ?? 0} completed ·{" "}
                  {day?.stats.sessionsInterrupted ?? 0} interrupted ·{" "}
                  {day?.stats.plannedMinutes ?? 0} min planned. The timer only
                  runs on today.
                </p>
              ) : (
                <>
                  <div className="flex gap-2">
                    <select
                      className="flex h-9 flex-1 rounded-md border border-black/20 bg-transparent px-3 text-sm text-primary-foreground [&>option]:text-black"
                      value={fTaskId}
                      onChange={(e) => setFTaskId(e.target.value)}
                    >
                      <option value="">No task (quick start)</option>
                      {openTasks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                    <Input
                      className="w-18 border-black/20 bg-transparent text-primary-foreground"
                      type="number"
                      min={1}
                      value={fMinutes}
                      onChange={(e) => setFMinutes(e.target.value)}
                    />
                  </div>
                  <Button
                    variant="secondary"
                    disabled={!mission || loading}
                    onClick={() =>
                      run(async () => {
                        const s: Session = await api("/api/focus-sessions/start", {
                          method: "POST",
                          body: JSON.stringify({
                            taskId: fTaskId || null,
                            plannedMinutes: Number(fMinutes),
                          }),
                        });
                        if (s.taskId) setFTaskId(s.taskId);
                      })
                    }
                  >
                    Start focus
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Handoff */}
          <Card className={GLASS}>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-xl">
                {isToday ? "Today starts with" : `${selectedLabel} started with`}
              </CardTitle>
              <CardDescription className={HUD}>
                {handoff
                  ? `Handoff from ${new Date(dayKey(handoff.reflectionDate) + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}.`
                  : "The previous evening\u2019s handoff."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {handoff?.nextStartAction ? (
                <p className="font-display text-lg leading-snug">
                  “{handoff.nextStartAction}”
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Save tonight&apos;s reflection with a first action, and it
                  appears here tomorrow morning.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Sessions */}
          <Card id="history" className={GLASS}>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-xl">Well done</CardTitle>
              <CardDescription className={HUD}>
                {doneMinutes} focused minutes{isToday ? " today" : ""}.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {sessions.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {isToday
                    ? "No sessions yet. Start the first one above."
                    : "No focus sessions on this day."}
                </p>
              )}
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-sm"
                >
                  <div>
                    <p>
                      {s.status === "running"
                        ? "Running…"
                        : `${s.actualMinutes ?? "?"} min · ${s.status}`}
                      <span className="text-muted-foreground">
                        {" · "}
                        {s.task?.title ?? "quick start"}
                      </span>
                    </p>
                    {(s.outcome || s.interruptionNote) && (
                      <p className="text-xs text-muted-foreground">
                        {s.outcome ?? s.interruptionNote}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline">{s.plannedMinutes} planned</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Reflection */}
          <Card id="reflection" className={`lg:col-span-2 ${GLASS}`}>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-xl">
                Evening reflection
                {!isToday && (
                  <span className={HUD + " ml-2"}>{selectedLabel}</span>
                )}
              </CardTitle>
              <CardDescription className={HUD}>
                Under five minutes.
                {reflection ? " Saved — editing updates it." : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid gap-2">
                <Label htmlFor="r-done">What got completed</Label>
                <Textarea
                  id="r-done"
                  value={rCompleted}
                  onChange={(e) => setRCompleted(e.target.value)}
                  placeholder="Real outcomes, not intentions…"
                  className="border-white/10 bg-white/[0.04]"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-2">
                  <Label htmlFor="r-block">Blockers</Label>
                  <Input
                    id="r-block"
                    value={rBlockers}
                    onChange={(e) => setRBlockers(e.target.value)}
                    placeholder="What blocked progress"
                    className="border-white/10 bg-white/[0.04]"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="r-dist">Distractions</Label>
                  <Input
                    id="r-dist"
                    value={rDistractions}
                    onChange={(e) => setRDistractions(e.target.value)}
                    placeholder="What pulled attention"
                    className="border-white/10 bg-white/[0.04]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="grid gap-2">
                  <Label htmlFor="r-energy">Energy (1-5)</Label>
                  <select
                    id="r-energy"
                    className="flex h-9 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm"
                    value={rEnergy}
                    onChange={(e) => setREnergy(e.target.value)}
                  >
                    {["1", "2", "3", "4", "5"].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="r-lost">Minutes lost</Label>
                  <Input
                    id="r-lost"
                    type="number"
                    min={0}
                    max={1440}
                    value={rLost}
                    onChange={(e) => setRLost(e.target.value)}
                    placeholder="Wasted min"
                    className="border-white/10 bg-white/[0.04]"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="r-lesson">One lesson</Label>
                  <Input
                    id="r-lesson"
                    value={rLesson}
                    onChange={(e) => setRLesson(e.target.value)}
                    placeholder="What did today teach"
                    className="border-white/10 bg-white/[0.04]"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="r-next">First action tomorrow</Label>
                <Input
                  id="r-next"
                  value={rNext}
                  onChange={(e) => setRNext(e.target.value)}
                  placeholder="The exact next step…"
                  className="border-white/10 bg-white/[0.04]"
                />
              </div>
              <Button
                disabled={loading}
                onClick={() =>
                  run(async () => {
                    await api("/api/reflections", {
                      method: "POST",
                      body: JSON.stringify({
                        reflectionDate: shownDate,
                        completedWork: rCompleted || null,
                        blockers: rBlockers || null,
                        distractions: rDistractions || null,
                        energyLevel: Number(rEnergy) || null,
                        lesson: rLesson || null,
                        nextStartAction: rNext || null,
                        minutesLost:
                          rLost.trim() === "" ? null : Math.round(Number(rLost)),
                      }),
                    });
                  })
                }
              >
                {reflection ? "Update reflection" : "Save reflection"}
              </Button>
              {recent.length > 0 && (
                <div className="flex flex-col gap-1.5 border-t border-white/10 pt-3">
                  {recent
                    .filter((r) => r.completedWork || r.lesson || r.blockers || r.distractions || r.nextStartAction || r.energyLevel != null || r.minutesLost != null)
                    .slice(0, 7)
                    .map((r) => (
                    <button
                      key={r.id}
                      onClick={() => selectDay(dayKey(r.reflectionDate))}
                      className="flex items-center justify-between gap-2 rounded-lg px-1 text-left text-sm hover:bg-white/5"
                    >
                      <p className="truncate text-muted-foreground">
                        {dayKey(r.reflectionDate)} —{" "}
                        {r.lesson || r.completedWork || "(empty)"}
                      </p>
                      {r.energyLevel != null && (
                        <Badge variant="outline">⚡{r.energyLevel}</Badge>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

        </main>
      {day && <CoachWidget date={day.date} dateLabel={selectedLabel} />}
    </>
  );
}
