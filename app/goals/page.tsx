"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FIELD, GLASS, HUD, api, fmtDay, todayKey } from "@/lib/ui";

type Horizon = "quarter" | "year" | "multi_year";
type Status = "active" | "achieved" | "dropped";
type Goal = {
  id: string;
  title: string;
  why: string | null;
  plan: string | null;
  horizon: Horizon;
  targetDate: string | null;
  status: Status;
};
type Draft = {
  title: string;
  why: string;
  plan: string;
  horizon: Horizon;
  targetDate: string;
};

const HORIZONS: { id: Horizon; label: string; hint: string }[] = [
  { id: "quarter", label: "3 months", hint: "What this season is for" },
  { id: "year", label: "1 year", hint: "Where you stand next year" },
  { id: "multi_year", label: "3+ years", hint: "The empire you are building" },
];

const EMPTY: Draft = { title: "", why: "", plan: "", horizon: "quarter", targetDate: "" };

function daysLeft(target: string, today: string): number {
  return Math.round((Date.parse(target) - Date.parse(today)) / 86400000);
}

// Add form and edit form are the same fields.
function GoalForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Draft;
  submitLabel: string;
  onSubmit: (d: Draft) => Promise<void>;
  onCancel?: () => void;
}) {
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Draft) => (v: string) => setD({ ...d, [k]: v });

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSubmit(d);
        } catch {
          // run() already shows the error; keep the form open with the text.
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="g-title">Goal</Label>
        <Input
          id="g-title"
          value={d.title}
          onChange={(e) => set("title")(e.target.value)}
          placeholder="e.g. Launch my AI agency with 3 paying clients"
          className={FIELD}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-2">
          <Label htmlFor="g-horizon">Horizon</Label>
          <select
            id="g-horizon"
            value={d.horizon}
            onChange={(e) => set("horizon")(e.target.value)}
            className={`flex h-9 rounded-md border px-3 text-sm ${FIELD}`}
          >
            {HORIZONS.map((h) => (
              <option key={h.id} value={h.id}>
                {h.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="g-date">Target date</Label>
          <Input
            id="g-date"
            type="date"
            value={d.targetDate}
            onChange={(e) => set("targetDate")(e.target.value)}
            className={FIELD}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="g-why">Why it matters</Label>
        <Input
          id="g-why"
          value={d.why}
          onChange={(e) => set("why")(e.target.value)}
          placeholder="The reason you will keep going on a bad day"
          className={FIELD}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="g-plan">Plan</Label>
        <Textarea
          id="g-plan"
          value={d.plan}
          onChange={(e) => set("plan")(e.target.value)}
          placeholder="The big steps, one per line…"
          className={`min-h-24 ${FIELD}`}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !d.title.trim()}>
          {busy ? "Saving…" : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

export default function GoalsPage() {
  const [today] = useState(todayKey);
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [openPlan, setOpenPlan] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api("/api/goals").then(
      (list: Goal[]) => active && setGoals(list),
      (e) => active && setError(e instanceof Error ? e.message : "Load failed")
    );
    return () => {
      active = false;
    };
  }, []);

  // Every write reloads the list, so the page always shows the database.
  async function run(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      setGoals((await api("/api/goals")) as Goal[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      throw e;
    }
  }

  const toBody = (d: Draft) => ({
    title: d.title,
    why: d.why,
    plan: d.plan,
    horizon: d.horizon,
    targetDate: d.targetDate || null,
  });

  const active = (goals ?? []).filter((g) => g.status === "active");
  const closed = (goals ?? []).filter((g) => g.status !== "active");

  // A plain render function, not a nested component: a component defined
  // inside another remounts on every render and loses its state.
  function renderGoal(g: Goal) {
    const target = g.targetDate?.slice(0, 10) ?? null;
    const left = target ? daysLeft(target, today) : null;
    if (editing === g.id) {
      return (
        <div className="rounded-xl bg-white/[0.04] p-3">
          <GoalForm
            initial={{
              title: g.title,
              why: g.why ?? "",
              plan: g.plan ?? "",
              horizon: g.horizon,
              targetDate: target ?? "",
            }}
            submitLabel="Save goal"
            onCancel={() => setEditing(null)}
            onSubmit={async (d) => {
              await run(() =>
                api(`/api/goals/${g.id}`, {
                  method: "PATCH",
                  body: JSON.stringify(toBody(d)),
                })
              );
              setEditing(null);
            }}
          />
        </div>
      );
    }
    const status = (s: Status) =>
      run(() =>
        api(`/api/goals/${g.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: s }),
        })
      ).catch(() => {});
    return (
      <div className="flex flex-col gap-2 rounded-xl bg-white/[0.04] p-3">
        <div className="flex items-start justify-between gap-2">
          <p
            className={`font-display text-lg leading-snug ${
              g.status === "dropped" ? "text-muted-foreground line-through" : ""
            }`}
          >
            {g.title}
          </p>
          {g.status !== "active" && (
            <Badge
              variant="outline"
              className={g.status === "achieved" ? "border-primary/60 text-primary" : ""}
            >
              {g.status}
            </Badge>
          )}
        </div>
        {g.why && <p className="text-sm text-muted-foreground">{g.why}</p>}
        {target && (
          <p className={HUD}>
            {fmtDay(target)} {target.slice(0, 4)}
            {g.status === "active" && left !== null && (
              <span className={left < 0 ? "text-destructive" : "text-primary"}>
                {" · "}
                {left < 0 ? `${-left} days over` : `${left} days left`}
              </span>
            )}
          </p>
        )}
        {g.plan && (
          <button
            onClick={() => setOpenPlan(openPlan === g.id ? null : g.id)}
            className="text-left"
          >
            <p
              className={`whitespace-pre-wrap border-l-2 border-primary/40 pl-2 text-sm text-foreground/80 ${
                openPlan === g.id ? "" : "line-clamp-2"
              }`}
            >
              {g.plan}
            </p>
          </button>
        )}
        <div className="flex flex-wrap gap-1 pt-1">
          {g.status === "active" ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => status("achieved")}>
                <Check className="h-4 w-4" /> Achieved
              </Button>
              <Button size="sm" variant="ghost" onClick={() => status("dropped")}>
                <X className="h-4 w-4" /> Drop
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => status("active")}>
              <RotateCcw className="h-4 w-4" /> Reopen
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setEditing(g.id)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => {
              if (!window.confirm(`Delete "${g.title}" for good?`)) return;
              run(() => api(`/api/goals/${g.id}`, { method: "DELETE" })).catch(
                () => {}
              );
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <main className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className={HUD + " text-primary"}>Goals / Long-term orbit</p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-display text-5xl font-semibold tracking-tight">
            Long-term <span className="text-primary">goals</span>
          </h1>
          {!adding && (
            <Button onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> New goal
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Daily missions are the small mass. These are the gravity they move toward.
        </p>
      </div>

      {error && (
        <p className="rounded-2xl bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {adding && (
        <Card className={GLASS}>
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-xl">New goal</CardTitle>
            <CardDescription className={HUD}>
              One outcome you can check, not a mood.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GoalForm
              initial={EMPTY}
              submitLabel="Add goal"
              onCancel={() => setAdding(false)}
              onSubmit={async (d) => {
                await run(() =>
                  api("/api/goals", { method: "POST", body: JSON.stringify(toBody(d)) })
                );
                setAdding(false);
              }}
            />
          </CardContent>
        </Card>
      )}

      {!goals && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

      {goals && (
        <div className="grid gap-4 lg:grid-cols-3">
          {HORIZONS.map((h) => {
            const list = active.filter((g) => g.horizon === h.id);
            return (
              <Card key={h.id} className={GLASS}>
                <CardHeader className="pb-2">
                  <CardTitle className="font-display text-xl">{h.label}</CardTitle>
                  <CardDescription className={HUD}>{h.hint}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {list.length === 0 && (
                    <p className="text-sm text-muted-foreground">No active goal here yet.</p>
                  )}
                  {list.map((g) => (
                    <div key={g.id}>{renderGoal(g)}</div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {closed.length > 0 && (
        <Card className={GLASS}>
          <CardHeader className="pb-2">
            <button
              onClick={() => setShowClosed(!showClosed)}
              className="text-left"
            >
              <CardTitle className="font-display text-xl">
                Achieved & dropped{" "}
                <span className={HUD}>({closed.length}) {showClosed ? "hide" : "show"}</span>
              </CardTitle>
            </button>
          </CardHeader>
          {showClosed && (
            <CardContent className="grid gap-2 md:grid-cols-2">
              {closed.map((g) => (
                <div key={g.id}>{renderGoal(g)}</div>
              ))}
            </CardContent>
          )}
        </Card>
      )}
      <TodayCoach />
    </main>
  );
}
