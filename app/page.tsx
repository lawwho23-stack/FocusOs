"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  CalendarDays,
  Check,
  History,
  ListChecks,
  NotebookPen,
  Orbit,
  Plus,
  Sun,
  Timer,
} from "lucide-react";
import SpaceCanvas from "@/components/space-canvas";
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
};
type DayProgress = {
  date: string;
  hasMission: boolean;
  missionDone: boolean;
  tasksDone: number;
  tasksTotal: number;
  focusMinutes: number;
  reflected: boolean;
};

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

// Database DATE values arrive as midnight UTC. Formatting in the
// browser's own timezone gives the calendar day the user lived.
function dayKey(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-CA"); // YYYY-MM-DD
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

const DOT_COLORS = ["#f5b90d", "#8b7cf6", "#3ddc97", "#f472b6", "#4cc3ff"];
const HUD = "font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground";
const GLASS = "border-white/10 bg-card/80 shadow-xl shadow-black/40 backdrop-blur";

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [mission, setMission] = useState<Mission | null>(null);
  const [noMission, setNoMission] = useState(false);
  const [progress, setProgress] = useState<DayProgress[]>([]);
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
  const [reflection, setReflection] = useState<Reflection | null>(null);
  const [recent, setRecent] = useState<Reflection[]>([]);
  const [rCompleted, setRCompleted] = useState("");
  const [rBlockers, setRBlockers] = useState("");
  const [rDistractions, setRDistractions] = useState("");
  const [rEnergy, setREnergy] = useState("3");
  const [rLesson, setRLesson] = useState("");
  const [rNext, setRNext] = useState("");
  // Which reflection the form was prefilled from. Prefill happens once
  // per reflection so refreshes never wipe unsaved typing.
  const refilledId = useRef<string | null>(null);

  // Reads server state without touching React state, so both the
  // initial load (inside an effect) and refreshes can share it.
  const fetchState = useCallback(async () => {
    const list = (await api("/api/projects")) as Project[];
    const active =
      list.find((p) => p.status === "active") ?? list[0] ?? null;
    let m: Mission | null = null;
    let noM = false;
    try {
      m = (await api("/api/missions/today")) as Mission;
    } catch (e) {
      if (e instanceof Error && e.message.includes("No mission")) {
        noM = true;
      } else {
        throw e;
      }
    }
    // Reflection belongs to the day, not the mission, so it loads
    // even when no mission exists.
    let refl: Reflection | null = null;
    try {
      refl = (await api(
        `/api/reflections?date=${dayKey(new Date())}`
      )) as Reflection;
    } catch (e) {
      if (!(e instanceof Error) || !e.message.includes("No reflection")) {
        throw e;
      }
    }
    const recentList = (await api("/api/reflections?recent=7")) as Reflection[];
    const week = (await api("/api/progress?days=7")) as DayProgress[];
    return {
      projects: list,
      project: active,
      mission: m,
      noMission: noM,
      reflection: refl,
      recent: recentList,
      progress: week,
    };
  }, []);

  const applyState = useCallback(
    (s: {
      projects: Project[];
      project: Project | null;
      mission: Mission | null;
      noMission: boolean;
      reflection: Reflection | null;
      recent: Reflection[];
      progress: DayProgress[];
    }) => {
      setProjects(s.projects);
      setProject(s.project);
      setMission(s.mission);
      setNoMission(s.noMission);
      setReflection(s.reflection);
      setRecent(s.recent);
      setProgress(s.progress);
      const key = s.reflection ? s.reflection.id : "none";
      if (refilledId.current !== key) {
        refilledId.current = key;
        setRCompleted(s.reflection?.completedWork ?? "");
        setRBlockers(s.reflection?.blockers ?? "");
        setRDistractions(s.reflection?.distractions ?? "");
        setREnergy(
          s.reflection?.energyLevel != null
            ? String(s.reflection.energyLevel)
            : "3"
        );
        setRLesson(s.reflection?.lesson ?? "");
        setRNext(s.reflection?.nextStartAction ?? "");
      }
    },
    []
  );

  useEffect(() => {
    let active = true;
    fetchState().then(
      (s) => {
        if (!active) return;
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
  }, [fetchState, applyState]);

  // Ticking clock so the running session shows elapsed time.
  // Display only — real duration is computed by the server on finish.
  const running: Session | null =
    mission?.tasks.flatMap((t) => t.sessions).find((s) => s.status === "running") ??
    null;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(fn: () => Promise<void>) {
    setError("");
    try {
      await fn();
      applyState(await fetchState());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  const tasks = mission?.tasks ?? [];
  const openTasks = tasks.filter((t) => t.status !== "completed");
  const completedTasks = tasks.filter((t) => t.status === "completed");
  const sessions = tasks.flatMap((t) => t.sessions);
  const doneSessions = sessions.filter((s) => s.status === "completed");
  const elapsedSec = running
    ? Math.max(0, Math.floor((now - new Date(running.startedAt).getTime()) / 1000))
    : 0;
  const elapsedLabel = `${String(Math.floor(elapsedSec / 60)).padStart(2, "0")}:${String(
    elapsedSec % 60
  ).padStart(2, "0")}`;
  const doneMinutes = doneSessions.reduce(
    (sum, s) => sum + (s.actualMinutes ?? 0),
    0
  );
  const taskProgress =
    tasks.length === 0
      ? 0
      : Math.round((completedTasks.length / tasks.length) * 100);

  // Yesterday's handoff: the newest past reflection that names a next action.
  const today = dayKey(new Date());
  const handoff =
    recent.find((r) => dayKey(r.reflectionDate) < today && r.nextStartAction) ??
    null;

  // Calendar month grid for the current month.
  const calDate = new Date();
  const calYear = calDate.getFullYear();
  const calMonth = calDate.getMonth();
  const monthName = calDate.toLocaleDateString(undefined, { month: "long" });
  const firstDow = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const markedDays = new Set<string>();
  if (mission) markedDays.add(today);
  recent.forEach((r) => markedDays.add(dayKey(r.reflectionDate)));
  const pad = (n: number) => String(n).padStart(2, "0");
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const maxWeekMinutes = Math.max(1, ...progress.map((d) => d.focusMinutes));

  const nav = [
    { id: "my-day", label: "My day", icon: Sun },
    { id: "tasks", label: "Tasks", icon: ListChecks },
    { id: "focus", label: "Focus", icon: Timer },
    { id: "reflection", label: "Notes", icon: NotebookPen },
    { id: "progress", label: "Progress", icon: Orbit },
    { id: "history", label: "History", icon: History },
  ];

  return (
    <div className="min-h-screen">
      <SpaceCanvas />
      <div className="mx-auto flex max-w-6xl items-start gap-4 p-4">
        {/* Sidebar */}
        <aside
          className={`sticky top-4 hidden w-56 shrink-0 flex-col gap-1 rounded-2xl p-3 md:flex ${GLASS}`}
        >
          <div className="flex items-center gap-2 px-2 py-2">
            <Orbit className="h-4 w-4 text-primary" />
            <p className="font-display text-lg font-semibold">FocusOS</p>
          </div>
          <p className={HUD + " px-3 pt-1"}>Space / Gravity / Motion</p>
          {nav.map((n) => (
            <button
              key={n.id}
              onClick={() => scrollTo(n.id)}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-foreground/80 transition-colors hover:bg-white/5"
            >
              <n.icon className="h-4 w-4 text-muted-foreground" />
              {n.label}
            </button>
          ))}
          <p className={HUD + " px-3 pt-3"}>Projects</p>
          {projects.map((p, i) => (
            <div
              key={p.id}
              className="flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-sm"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: DOT_COLORS[i % DOT_COLORS.length] }}
              />
              <span className="truncate">{p.name}</span>
            </div>
          ))}
          <div className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-foreground/80">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            {calDate.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </div>
          <div className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted-foreground">
            <Archive className="h-4 w-4" />
            {doneSessions.length} sessions done
          </div>
        </aside>

        {/* Main column */}
        <main className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Hero */}
          <div className="flex flex-col gap-1 lg:col-span-3">
            <p className={HUD + " text-primary"}>
              Space&nbsp;&nbsp;/&nbsp;&nbsp;Gravity&nbsp;&nbsp;/&nbsp;&nbsp;Motion
            </p>
            <h1 className="font-display text-5xl font-semibold tracking-tight">
              Today&apos;s <span className="text-primary">orbit</span>
            </h1>
            <p className="font-mono text-sm text-muted-foreground">
              Small mass moves daily. Consistency builds the universe.
            </p>
          </div>

          {error && (
            <p className="rounded-2xl bg-destructive/10 px-4 py-2 text-sm text-destructive lg:col-span-3">
              {error}
            </p>
          )}

          {/* Week progress strip */}
          <Card id="progress" className={`lg:col-span-3 ${GLASS}`}>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-xl">This week</CardTitle>
              <CardDescription className={HUD}>
                Mass curves space · Gravity creates motion
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-2">
                {progress.map((d) => {
                  const isToday = d.date === today;
                  const label = new Date(d.date + "T00:00:00")
                    .toLocaleDateString(undefined, { weekday: "narrow" });
                  return (
                    <div
                      key={d.date}
                      className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 ${
                        isToday ? "bg-primary/10 ring-1 ring-primary/50" : "bg-white/[0.03]"
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
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Calendar */}
          <Card className={GLASS}>
            <CardHeader className="pb-2">
              <div className="flex items-baseline justify-between">
                <CardTitle className="font-display text-xl">
                  {monthName}
                </CardTitle>
                <span className={HUD}>{calYear}</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                  <span key={i} className="font-mono">
                    {d}
                  </span>
                ))}
                {cells.map((day, i) => {
                  if (day === null) return <span key={i} />;
                  const key = `${calYear}-${pad(calMonth + 1)}-${pad(day)}`;
                  const isToday = key === today;
                  return (
                    <span
                      key={i}
                      className={`flex flex-col items-center rounded-full py-1 text-xs ${
                        isToday
                          ? "bg-primary font-semibold text-primary-foreground"
                          : ""
                      }`}
                    >
                      {day}
                      <span
                        className={`h-1 w-1 rounded-full ${
                          markedDays.has(key) && !isToday
                            ? "bg-primary"
                            : "bg-transparent"
                        }`}
                      />
                    </span>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* My day summary */}
          <Card id="my-day" className={GLASS}>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-xl">My day</CardTitle>
              <CardDescription className={HUD}>
                {reflection?.energyLevel
                  ? `Energy ${reflection.energyLevel}/5 · ${taskProgress}% tasks`
                  : `${taskProgress}% tasks complete`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="font-display text-lg leading-snug">
                {mission ? mission.title : "No mission yet today."}
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
                Upcoming tasks
              </CardTitle>
              <CardDescription className={HUD}>
                {mission ? "Tap the box to complete." : "Save a mission first."}
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
                    <span className="ml-auto font-mono text-xs text-muted-foreground">
                      {t.estimatedMinutes}m
                    </span>
                  )}
                </button>
              ))}
              {mission && (
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
                Today&apos;s mission
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
                    onClick={() =>
                      run(async () => {
                        if (!project) throw new Error("No project found.");
                        await api("/api/missions", {
                          method: "POST",
                          body: JSON.stringify({
                            projectId: project.id,
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
              <CardDescription className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary-foreground/70">
                {running ? "Focusing now" : "Pomodoro timer"}
              </CardDescription>
              <CardTitle className="font-display text-5xl font-semibold tracking-tight">
                {running ? elapsedLabel : `${fMinutes.padStart(2, "0")}:00`}
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
                    disabled={!mission}
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
                Tomorrow starts with
              </CardTitle>
              <CardDescription className={HUD}>
                Yesterday&apos;s handoff.
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
                {doneMinutes} focused minutes today.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {sessions.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No sessions yet. Start the first one above.
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
              <div className="grid grid-cols-2 gap-2">
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
                onClick={() =>
                  run(async () => {
                    await api("/api/reflections", {
                      method: "POST",
                      body: JSON.stringify({
                        completedWork: rCompleted || null,
                        blockers: rBlockers || null,
                        distractions: rDistractions || null,
                        energyLevel: Number(rEnergy) || null,
                        lesson: rLesson || null,
                        nextStartAction: rNext || null,
                      }),
                    });
                  })
                }
              >
                {reflection ? "Update reflection" : "Save reflection"}
              </Button>
              {recent.length > 0 && (
                <div className="flex flex-col gap-1.5 border-t border-white/10 pt-3">
                  {recent.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <p className="truncate text-muted-foreground">
                        {dayKey(r.reflectionDate)} —{" "}
                        {r.lesson || r.completedWork || "(empty)"}
                      </p>
                      {r.energyLevel != null && (
                        <Badge variant="outline">⚡{r.energyLevel}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
