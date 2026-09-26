"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TodayCoach from "@/components/today-coach";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GLASS, HUD, api, fmtDay } from "@/lib/ui";

type Session = {
  id: string;
  startedAt: string;
  plannedMinutes: number;
  actualMinutes: number | null;
  status: string;
  outcome: string | null;
  interruptionNote: string | null;
  task: { title: string } | null;
};
type FocusDay = {
  date: string;
  focusMinutes: number;
  sessionsCompleted: number;
  sessionsInterrupted: number;
  sessions: Session[];
};
type History = {
  focusMinutes: number;
  sessionsCompleted: number;
  sessionsInterrupted: number;
  days: FocusDay[];
};

const RANGES = [7, 30, 90];

const fmtHours = (min: number) =>
  min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`;

export default function FocusHistoryPage() {
  const [range, setRange] = useState(30);
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api(`/api/focus-sessions?days=${range}`).then(
      (d: History) => {
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

  const maxDay = Math.max(1, ...(data?.days.map((d) => d.focusMinutes) ?? []));

  return (
    <main className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className={HUD + " text-primary"}>Focus / History</p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-display text-5xl font-semibold tracking-tight">
            Focus <span className="text-primary">log</span>
          </h1>
          <div className="flex gap-1 rounded-xl border border-white/10 p-1">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
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
        <p className="font-mono text-sm text-muted-foreground">
          Every session you started, newest first.
        </p>
      </div>

      {error && (
        <p className="rounded-2xl bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Focused", value: data ? fmtHours(data.focusMinutes) : "–" },
          { label: "Completed", value: data?.sessionsCompleted ?? "–" },
          { label: "Interrupted", value: data?.sessionsInterrupted ?? "–" },
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
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
      {data && data.days.length === 0 && (
        <Card className={GLASS}>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No focus sessions in the last {range} days. Start one on{" "}
            <Link href="/" className="text-primary underline">
              My day
            </Link>
            .
          </CardContent>
        </Card>
      )}

      {data?.days.map((d) => (
        <Card key={d.date} className={GLASS}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="font-display text-xl">
                <Link href={`/?date=${d.date}`} className="hover:text-primary">
                  {fmtDay(d.date, true)}
                </Link>
              </CardTitle>
              <p className="font-display text-xl text-primary">
                {fmtHours(d.focusMinutes)}
              </p>
            </div>
            <CardDescription className={HUD}>
              {d.sessionsCompleted} done
              {d.sessionsInterrupted ? ` · ${d.sessionsInterrupted} interrupted` : ""}
            </CardDescription>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${(d.focusMinutes / maxDay) * 100}%` }}
              />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {d.sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate">
                    <span className="font-mono text-muted-foreground">
                      {new Date(s.startedAt).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {"  "}
                    {s.status === "running"
                      ? "Running…"
                      : `${s.actualMinutes ?? "?"} min`}
                    <span className="text-muted-foreground">
                      {" · "}
                      {s.task?.title ?? "quick start"}
                    </span>
                  </p>
                  {(s.outcome || s.interruptionNote) && (
                    <p className="truncate text-xs text-muted-foreground">
                      {s.outcome ?? s.interruptionNote}
                    </p>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className={s.status === "completed" ? "border-primary/50 text-primary" : ""}
                >
                  {s.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
      <TodayCoach />
    </main>
  );
}
