"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import MissionIcon, { ICON_LABELS } from "@/components/mission-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FIELD, GLASS, HUD, api } from "@/lib/ui";
import {
  EMPTY_MISSION, MISSION_DRAFT_PREFIX, MISSION_ICONS, checklistProgress,
  missionToDraft, parseMissionDraft,
  type LifeMission, type MissionDraft,
} from "@/lib/life-missions";

type Props = {
  mission?: LifeMission;
  onSaved: (mission: LifeMission, warning?: string) => void;
  onDeleted: (id: string, warning?: string) => void;
  onCancel?: () => void;
};

export default function LifeMissionCard({ mission, onSaved, onDeleted, onCancel }: Props) {
  const initial = mission ? missionToDraft(mission) : EMPTY_MISSION;
  const [draft, setDraft] = useState<MissionDraft>(initial);
  const [baseline, setBaseline] = useState(initial);
  const [baselineVersion, setBaselineVersion] = useState(mission?.updatedAt);
  const [version, setVersion] = useState(mission?.updatedAt);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const [step, setStep] = useState("");
  const [showIcons, setShowIcons] = useState(false);
  const [latest, setLatest] = useState<LifeMission | null>(null);
  const action = useRef(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const key = MISSION_DRAFT_PREFIX + (mission?.id ?? "new");
  const prefix = `mission-${mission?.id ?? "new"}`;
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline) || step !== "";
  const progress = checklistProgress(draft.checklist);

  useEffect(() => {
    // Recover only after mount; server HTML must not depend on browser storage.
    const timer = setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(key);
        const recovered = parseMissionDraft(raw);
        if (recovered) {
          setDraft(recovered);
          const stored = JSON.parse(raw!);
          if (typeof stored.expectedUpdatedAt === "string") setVersion(stored.expectedUpdatedAt);
          if (typeof stored.pendingStep === "string" && stored.pendingStep.length <= 200) setStep(stored.pendingStep);
        }
      } catch {
        setStorageWarning("Browser draft recovery is unavailable. Save before leaving this page.");
      }
      setReady(true);
      if (!mission) titleInput.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [key, mission]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change(next: MissionDraft, pendingStep = step, savedVersion = version) {
    setDraft(next);
    setStep(pendingStep);
    setError("");
    try {
      // Session storage isolates drafts by tab and survives refresh/navigation.
      sessionStorage.setItem(key, JSON.stringify({ version: 1, draft: next, pendingStep, expectedUpdatedAt: savedVersion }));
      setStorageWarning("");
    } catch {
      setStorageWarning("This draft could not be kept in your browser. Save before leaving this page.");
    }
  }

  function clearDraft(): string | undefined {
    try { sessionStorage.removeItem(key); }
    catch { return "Your mission was saved, but the browser draft could not be cleared. An old draft may reappear after refresh."; }
  }

  async function save() {
    if (action.current) return;
    action.current = true;
    setBusy(true);
    setError("");
    try {
      const savingDraft = step.trim() ? { ...draft, checklist: [...draft.checklist, { id: crypto.randomUUID(), title: step.trim(), completed: false }] } : draft;
      const saved: LifeMission = await api(mission ? `/api/life-missions/${mission.id}` : "/api/life-missions", {
        method: mission ? "PATCH" : "POST",
        body: JSON.stringify({ ...savingDraft, ...(mission ? { expectedUpdatedAt: version } : {}) }),
      });
      // Mark a successful save before cleanup, so a cleanup failure cannot
      // resurrect a new-card draft and create a second copy of the mission.
      try { sessionStorage.setItem(key, JSON.stringify({ version: 1, savedId: saved.id })); } catch { /* Surface cleanup failures below. */ }
      const warning = clearDraft();
      setDraft(missionToDraft(saved));
      setBaseline(missionToDraft(saved));
      setBaselineVersion(saved.updatedAt);
      setVersion(saved.updatedAt);
      setStep("");
      setStorageWarning("");
      setLatest(null);
      onSaved(saved, warning);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your mission. Please try again.");
    } finally { action.current = false; setBusy(false); }
  }

  function discard() {
    if (dirty && !window.confirm("Discard this unsaved mission draft?")) return;
    try { sessionStorage.removeItem(key); }
    catch { setStorageWarning("Could not discard the browser draft. Your writing is still here; please try again."); return; }
    setDraft(baseline);
    setVersion(baselineVersion);
    setError("");
    setStorageWarning("");
    setStep("");
    setLatest(null);
    onCancel?.();
  }

  async function remove() {
    if (!mission || action.current || !window.confirm(`Delete “${mission.title}” and its checklist?`)) return;
    action.current = true;
    setBusy(true);
    setError("");
    try {
      await api(`/api/life-missions/${mission.id}`, { method: "DELETE" });
      let warning: string | undefined;
      try { sessionStorage.removeItem(key); }
      catch { warning = "Mission deleted, but its old browser draft could not be cleared."; }
      onDeleted(mission.id, warning);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not delete your mission. Please try again."); }
    finally { action.current = false; setBusy(false); }
  }

  async function reviewSaved() {
    if (!mission || action.current) return;
    action.current = true;
    setBusy(true);
    try { setLatest(await api(`/api/life-missions/${mission.id}`)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load the saved mission. Your draft is kept."); }
    finally { action.current = false; setBusy(false); }
  }

  return (
    <Card className={`${GLASS} overflow-hidden ${!mission ? "border-primary/40" : ""}`}>
      <CardContent className="p-5 sm:p-6">
        <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <fieldset disabled={busy || !ready} className="flex min-w-0 flex-col gap-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <button type="button" aria-label="Choose mission icon" aria-expanded={showIcons}
                  onClick={() => setShowIcons(!showIcons)}
                  className="flex size-12 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <MissionIcon name={draft.icon} className="size-6" />
                </button>
                <div>
                  <p className={HUD}>{mission ? "Life mission" : "New life mission"}</p>
                  <p className="mt-1 text-xs text-muted-foreground" role="status">{dirty ? "Unsaved draft" : "Your direction, at your pace."}</p>
                </div>
              </div>
              {mission && <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${mission.title}`} onClick={() => void remove()}><Trash2 /></Button>}
            </div>

            {showIcons && (
              <div role="group" aria-label="Mission icons" className="grid grid-cols-4 gap-2 rounded-xl border border-white/10 p-2">
                {MISSION_ICONS.map((icon) => (
                  <button key={icon} type="button" aria-label={`${ICON_LABELS[icon]} icon`} aria-pressed={draft.icon === icon}
                    onClick={() => { change({ ...draft, icon }); setShowIcons(false); }}
                    className={`flex flex-col items-center gap-1 rounded-lg p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary ${draft.icon === icon ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-white/5"}`}>
                    <MissionIcon name={icon} className="size-5" />{ICON_LABELS[icon]}
                  </button>
                ))}
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor={`${prefix}-title`}>Mission title</Label>
              <Input ref={titleInput} id={`${prefix}-title`} required maxLength={200} value={draft.title}
                onChange={(e) => change({ ...draft, title: e.target.value })}
                placeholder="What do you want your life to stand for?" className={`${FIELD} font-display text-lg`} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${prefix}-writing`}>My mission</Label>
              <Textarea id={`${prefix}-writing`} required maxLength={50000} rows={5} value={draft.writing}
                onChange={(e) => change({ ...draft, writing: e.target.value })}
                placeholder="Write what matters to you, why it matters, and the direction you want to follow…"
                className={`${FIELD} min-h-36 resize-y leading-relaxed`} />
            </div>

            <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Steps toward this mission</p>
                <p className="text-xs text-muted-foreground" role="status">{progress.total ? `${progress.completed} of ${progress.total} · ${progress.percent}%` : "No steps yet"}</p>
              </div>
              <div role="progressbar" aria-label="Mission progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}
                className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-primary" style={{ width: `${progress.percent}%` }} />
              </div>
              {draft.checklist.map((item, index) => (
                <div key={item.id} className="flex min-w-0 items-center gap-2">
                  <input type="checkbox" aria-label={`Complete ${item.title || `step ${index + 1}`}`} checked={item.completed}
                    onChange={(e) => change({ ...draft, checklist: draft.checklist.map((s) => s.id === item.id ? { ...s, completed: e.target.checked } : s) })}
                    className="size-4 shrink-0 accent-primary" />
                  <Input aria-label={`Step ${index + 1}`} value={item.title} required maxLength={200}
                    onChange={(e) => change({ ...draft, checklist: draft.checklist.map((s) => s.id === item.id ? { ...s, title: e.target.value } : s) })}
                    className={`${FIELD} min-w-0 flex-1 ${item.completed ? "text-muted-foreground line-through" : ""}`} />
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove step ${index + 1}`}
                    onClick={() => change({ ...draft, checklist: draft.checklist.filter((s) => s.id !== item.id) })}><X /></Button>
                </div>
              ))}
              <div className="flex min-w-0 gap-2">
                <Input aria-label="New step" value={step} maxLength={200} placeholder="One meaningful step…"
                  onChange={(e) => change(draft, e.target.value)} className={`${FIELD} min-w-0 flex-1`}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById(`${prefix}-add-step`)?.click(); } }} />
                <Button id={`${prefix}-add-step`} type="button" variant="outline" size="icon" aria-label="Add step"
                  disabled={!step.trim() || draft.checklist.length >= 100}
                  onClick={() => change({ ...draft, checklist: [...draft.checklist, { id: crypto.randomUUID(), title: step.trim(), completed: false }] }, "")}><Plus /></Button>
              </div>
            </div>

            {error && <div role="alert" className="flex flex-col items-start gap-2 text-sm text-destructive"><p>{error}</p>
              {mission && <Button type="button" variant="outline" onClick={() => void reviewSaved()}>Review saved version</Button>}
            </div>}
            {latest && <section aria-label="Latest saved mission" className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <p className={HUD}>Latest saved version</p>
              <p className="break-words font-medium">{latest.title} · {ICON_LABELS[latest.icon]}</p>
              <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{latest.writing}</p>
              {latest.checklist.length > 0 && <ul className="list-inside list-disc text-sm text-muted-foreground">{latest.checklist.map((item) => <li key={item.id} className="break-words">{item.completed ? "Completed: " : "Open: "}{item.title}</li>)}</ul>}
              <p className="text-xs leading-relaxed text-muted-foreground">Compare this with your draft above. Combine any changes you want to keep, then use your reviewed draft. Your next Save will replace this saved version.</p>
              <Button type="button" variant="outline" onClick={() => {
                setBaseline(missionToDraft(latest));
                setBaselineVersion(latest.updatedAt);
                setVersion(latest.updatedAt);
                change(draft, step, latest.updatedAt);
                setLatest(null);
                setError("");
              }}>Use reviewed draft</Button>
            </section>}
            {storageWarning && <p role="status" className="text-sm text-primary">{storageWarning}</p>}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button type="submit" disabled={!dirty || !draft.title.trim() || !draft.writing.trim() || draft.checklist.some((s) => !s.title.trim()) || (draft.checklist.length >= 100 && !!step.trim())}>
                <Check />{busy ? "Saving…" : mission ? "Save changes" : "Save mission"}
              </Button>
              {(dirty || !mission) && <Button type="button" variant="ghost" onClick={discard}>{mission ? "Discard draft" : "Cancel"}</Button>}
              {!ready && <p className="text-xs text-muted-foreground">Recovering draft…</p>}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">Save includes checklist changes and your new step. Unsaved drafts stay in this tab through refresh; save before closing it.</p>
          </fieldset>
        </form>
      </CardContent>
    </Card>
  );
}
