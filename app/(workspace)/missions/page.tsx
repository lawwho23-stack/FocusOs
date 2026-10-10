"use client";

import { useCallback, useEffect, useState } from "react";
import { Compass, Plus } from "lucide-react";
import LifeMissionCard from "@/components/life-mission-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GLASS, HUD, api } from "@/lib/ui";
import { MISSION_DRAFT_PREFIX, parseMissionDraft, type LifeMission } from "@/lib/life-missions";
import TodayCoach from "@/components/today-coach";

export default function MissionsPage() {
  const [missions, setMissions] = useState<LifeMission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async (active: () => boolean = () => true) => {
    setLoading(true);
    setError("");
    try {
      const list: LifeMission[] = await api("/api/life-missions");
      if (active()) setMissions(list);
    } catch (e) { if (active()) setError(e instanceof Error ? e.message : "Could not load missions."); }
    finally { if (active()) setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void load(() => active);
      try { if (parseMissionDraft(sessionStorage.getItem(MISSION_DRAFT_PREFIX + "new"))) setAdding(true); }
      catch { /* Each editor surfaces unavailable browser storage. */ }
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [load]);

  function saved(mission: LifeMission, warning?: string) {
    setMissions((list) => list.some((m) => m.id === mission.id) ? list.map((m) => m.id === mission.id ? mission : m) : [mission, ...list]);
    setNotice(warning ?? "Mission saved.");
  }

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl">
          <p className={HUD + " text-primary"}>The direction of your life</p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">My <span className="text-primary">missions</span></h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">What you want your life to stand for. Write your mission, then take it one meaningful step at a time.</p>
        </div>
        <Button disabled={adding || loading} onClick={() => { setAdding(true); setNotice(""); }}><Plus />Add mission</Button>
      </header>
      {notice && <p role="status" className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">{notice}</p>}
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-destructive/10 p-4"><p className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={() => void load()}>Retry</Button></div>}
      {loading && <p role="status" className="text-sm text-muted-foreground">Loading missions…</p>}
      {!loading && !error && !missions.length && !adding && (
        <Card className={GLASS}><CardContent className="flex flex-col items-center gap-4 px-6 py-14 text-center">
          <Compass className="size-10 text-primary" />
          <h2 className="font-display text-2xl font-semibold">Give your life a direction.</h2>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">Your missions can be about the people you help, the things you build, or the person you want to become.</p>
          <Button onClick={() => setAdding(true)}><Plus />Write my first mission</Button>
        </CardContent></Card>
      )}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        {adding && <LifeMissionCard key="new" onSaved={(mission, warning) => { saved(mission, warning); setAdding(false); }} onDeleted={() => {}} onCancel={() => setAdding(false)} />}
        {missions.map((mission) => <LifeMissionCard key={mission.id} mission={mission} onSaved={saved}
          onDeleted={(id, warning) => { setMissions((list) => list.filter((m) => m.id !== id)); setNotice(warning ?? "Mission deleted."); }} />)}
      </div>
      <TodayCoach />
    </main>
  );
}
