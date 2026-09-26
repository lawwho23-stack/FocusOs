"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TodayCoach from "@/components/today-coach";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { hasReflection } from "@/lib/reflection";
import { GLASS, HUD, api, fmtDay } from "@/lib/ui";

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

const PAGE = 30;

// Read-only. Writing and editing a reflection happens on My day.
export default function ReflectionHistoryPage() {
  // Raw rows from the API (including coach-only rows), so paging can
  // continue from the oldest row fetched.
  const [rows, setRows] = useState<Reflection[] | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api(`/api/reflections?recent=${PAGE}`).then(
      (list: Reflection[]) => {
        if (!active) return;
        setRows(list);
        setMore(list.length === PAGE);
      },
      (e) => active && setError(e instanceof Error ? e.message : "Load failed")
    );
    return () => {
      active = false;
    };
  }, []);

  async function loadMore() {
    if (!rows?.length) return;
    setBusy(true);
    try {
      const oldest = rows[rows.length - 1].reflectionDate.slice(0, 10);
      const list = (await api(
        `/api/reflections?recent=${PAGE}&before=${oldest}`
      )) as Reflection[];
      setRows([...rows, ...list]);
      setMore(list.length === PAGE);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }

  const list = (rows ?? []).filter(hasReflection);
  // Energy trend, oldest -> newest, for days that recorded it.
  const energy = [...list]
    .reverse()
    .filter((r) => r.energyLevel != null)
    .slice(-30);
  const lostTotal = list.reduce((n, r) => n + (r.minutesLost ?? 0), 0);

  return (
    <main className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className={HUD + " text-primary"}>Reflection / History</p>
        <h1 className="font-display text-5xl font-semibold tracking-tight">
          Looking <span className="text-primary">back</span>
        </h1>
        <p className="font-mono text-sm text-muted-foreground">
          Every evening reflection, newest first. Write tonight&apos;s on{" "}
          <Link href="/#reflection" className="text-primary underline">
            My day
          </Link>
          .
        </p>
      </div>

      {error && (
        <p className="rounded-2xl bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {energy.length >= 2 && (
        <Card className={GLASS}>
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-xl">Energy trend</CardTitle>
            <CardDescription className={HUD}>
              Last {energy.length} reflections · {lostTotal} min lost in view
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-24 items-end gap-1">
              {energy.map((r) => (
                <div
                  key={r.id}
                  title={`${r.reflectionDate.slice(0, 10)}: energy ${r.energyLevel}`}
                  className="max-w-8 flex-1 rounded-t bg-primary/80"
                  style={{ height: `${((r.energyLevel ?? 0) / 5) * 100}%` }}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!rows && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      {rows && list.length === 0 && (
        <Card className={GLASS}>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No reflections yet.
          </CardContent>
        </Card>
      )}

      {list.map((r) => {
        const day = r.reflectionDate.slice(0, 10);
        const fields: [string, string | null][] = [
          ["Completed", r.completedWork],
          ["Blockers", r.blockers],
          ["Distractions", r.distractions],
          ["Lesson", r.lesson],
          ["First action next day", r.nextStartAction],
        ];
        return (
          <Card key={r.id} className={GLASS}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="font-display text-xl">
                  <Link href={`/?date=${day}`} className="hover:text-primary">
                    {fmtDay(day, true)}
                  </Link>
                </CardTitle>
                <div className="flex gap-1.5">
                  {r.energyLevel != null && (
                    <Badge variant="outline">⚡ {r.energyLevel}/5</Badge>
                  )}
                  {r.minutesLost != null && (
                    <Badge variant="outline">{r.minutesLost} min lost</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {fields
                .filter(([, v]) => v)
                .map(([label, v]) => (
                  <div key={label} className="flex flex-col gap-0.5">
                    <p className={HUD}>{label}</p>
                    <p className="whitespace-pre-wrap text-sm">{v}</p>
                  </div>
                ))}
            </CardContent>
          </Card>
        );
      })}

      {more && (
        <Button variant="outline" onClick={loadMore} disabled={busy}>
          {busy ? "Loading…" : "Load older"}
        </Button>
      )}
      <TodayCoach />
    </main>
  );
}
