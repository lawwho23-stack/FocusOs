"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TodayCoach from "@/components/today-coach";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GLASS, HUD, api, fmtDay } from "@/lib/ui";

type Score = { score: number; confidence: number; label: string } | null;
type Row = {
  date: string;
  missionTitle: string | null;
  missionDone: boolean;
  tasksDone: number;
  tasksTotal: number;
  focusMinutes: number;
  sessionsCompleted: number;
  score: Score;
};
type Progress = {
  aiError: string | null;
  totals: {
    tasksDone: number;
    focusMinutes: number;
    activeDays: number;
    avgScore: number | null;
  };
  days: Row[];
};

const RANGES = [7, 30, 90];

const fmtHours = (min: number) =>
  min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`;

const isActive = (r: Row) => !!(r.missionTitle || r.tasksTotal || r.focusMinutes);

export default function ProgressPage() {
  const [range, setRange] = useState(7);
  const [data, setData] = useState<Progress | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api(`/api/progress/days?days=${range}`).then(
      (d: Progress) => {
        if (!active) return;
        setError("");
        setData(d);
      },
      (e) => active && setError(e instanceof Error ? e.message : "Load failed")
    );
    return () => {
      active = false;
    };
  }, [range]);

  // Best day in view, to highlight it in the compare chart.
  const best = data?.days.reduce<Row | null>(
    (b, r) => (r.score && (!b?.score || r.score.score > b.score.score) ? r : b),
    null
  );
  const chart = data ? [...data.days].reverse() : []; // oldest -> newest
  const listed = data?.days.filter(isActive) ?? [];

  return (
    <main className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className={HUD + " text-primary"}>Progress / Day by day</p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-display text-5xl font-semibold tracking-tight">
            Progress <span className="text-primary">score</span>
          </h1>
          <div className="flex gap-1 rounded-xl border border-white/10 p-1">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => {
                  setData(null);
                  setRange(r);
                }}
                className={`rounded-lg px-3 py-1 text-sm ${
                  r === range
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-white/5"
                }`}
              >
                {r} days
              </button>
            ))}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Tasks and focus time are counted. The score (0–100) is Jev&apos;s
          judgment of each day against its own mission.
        </p>
      </div>

      {error && (
        <p className="rounded-2xl bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {data?.aiError && (
        <p className="rounded-2xl bg-white/5 px-4 py-2 text-sm text-muted-foreground">
          {data.aiError}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Avg score", value: data?.totals.avgScore ?? "–" },
          { label: "Tasks done", value: data?.totals.tasksDone ?? "–" },
          { label: "Focused", value: data ? fmtHours(data.totals.focusMinutes) : "–" },
          { label: "Active days", value: data ? `${data.totals.activeDays}/${range}` : "–" },
        ].map((s) => (
          <Card key={s.label} className={GLASS}>
            <CardContent className="flex flex-col items-center gap-1 py-4">
              <p className="font-display text-3xl font-semibold">{s.value}</p>
              <p className={HUD}>{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {!data && !error && (
        <p className="text-sm text-muted-foreground">
          Loading… (the first load of new days asks Jev, which can take a few seconds)
        </p>
      )}

      {data && (
        <Card className={GLASS}>
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-xl">Compare days</CardTitle>
            <CardDescription className={HUD}>
              Score per day · best {best?.score ? `${fmtDay(best.date)} (${best.score.score})` : "–"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-40 items-end gap-1">
              {chart.map((r) => {
                const s = r.score?.score ?? 0;
                const isBest = best?.date === r.date && s > 0;
                return (
                  <Link
                    key={r.date}
                    href={`/?date=${r.date}`}
                    title={`${r.date}: score ${r.score ? s : "not scored"}, ${r.tasksDone}/${r.tasksTotal} tasks, ${r.focusMinutes} min`}
                    className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                  >
                    {range <= 30 && s > 0 && (
                      <span className="text-[10px] text-muted-foreground">{s}</span>
                    )}
                    <div
                      className={`w-full max-w-10 rounded-t transition-opacity group-hover:opacity-80 ${
                        isBest ? "bg-primary" : "bg-primary/50"
                      }`}
                      style={{ height: `${Math.max(s, 2)}%` }}
                    />
                  </Link>
                );
              })}
            </div>
            {range === 7 && (
              <div className="mt-1 flex gap-1">
                {chart.map((r) => (
                  <span key={r.date} className="flex-1 text-center text-[10px] text-muted-foreground">
                    {new Date(r.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "narrow" })}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {data && listed.length === 0 && (
        <Card className={GLASS}>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No activity in the last {range} days.
          </CardContent>
        </Card>
      )}

      {listed.map((r) => (
        <Card key={r.date} className={GLASS}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="font-display text-xl">
                  <Link href={`/?date=${r.date}`} className="hover:text-primary">
                    {fmtDay(r.date, true)}
                  </Link>
                </CardTitle>
                <CardDescription className="truncate pt-1 text-sm">
                  {r.missionTitle ?? "No mission"}
                  {r.missionDone && <span className="text-primary"> · completed</span>}
                </CardDescription>
              </div>
              <div className="text-right">
                <p className="font-display text-3xl font-semibold text-primary tabular-nums">
                  {r.score ? r.score.score : "–"}
                </p>
                <p className={HUD}>score</p>
              </div>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${r.score?.score ?? 0}%` }}
              />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { v: `${r.tasksDone}/${r.tasksTotal}`, l: "Tasks done" },
                { v: fmtHours(r.focusMinutes), l: "Focus" },
                { v: r.sessionsCompleted, l: "Sessions" },
              ].map((x) => (
                <div key={x.l} className="rounded-xl bg-white/[0.04] px-3 py-2">
                  <p className="font-display text-lg font-semibold tabular-nums">{x.v}</p>
                  <p className={HUD}>{x.l}</p>
                </div>
              ))}
            </div>
            {r.score && (
              <p className="text-sm text-muted-foreground">
                Jev: {r.score.label}
                <span className="text-xs"> · confidence {Math.round(r.score.confidence * 100)}%</span>
              </p>
            )}
          </CardContent>
        </Card>
      ))}
      <TodayCoach />
    </main>
  );
}
