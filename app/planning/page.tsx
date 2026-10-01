"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, ChevronDown, Lightbulb, Pencil, RotateCcw } from "lucide-react";
import PlanningIdeaForm from "@/components/planning-idea-form";
import TodayCoach from "@/components/today-coach";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PLANNING_DRAFT_PREFIX, PLANNING_QUESTIONS, PLANNING_STATUSES,
  ideaToDraft, parsePlanningDraft,
  type PlanningDraft, type PlanningIdea, type PlanningStatus,
} from "@/lib/planning-ideas";
import { FIELD, GLASS, HUD, api } from "@/lib/ui";

const LABELS: Record<PlanningStatus, string> = { saved: "Saved", planned: "Planned", done: "Done", archived: "Archived" };

export default function PlanningPage() {
  const [ideas, setIdeas] = useState<PlanningIdea[] | null>(null);
  const [filter, setFilter] = useState<PlanningStatus | "all">("saved");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const updating = useRef(false);

  const onDraftChange = useCallback((id: string, dirty: boolean) => {
    setDraftIds((ids) => dirty ? ids.includes(id) ? ids : [...ids, id] : ids.filter((entry) => entry !== id));
    if (dirty) setNotice("");
  }, []);

  useEffect(() => {
    let active = true;
    api("/api/planning-ideas").then((list: PlanningIdea[]) => {
      if (!active) return;
      setIdeas(list);
      try {
        const recovered = list.filter((idea) => parsePlanningDraft(localStorage.getItem(PLANNING_DRAFT_PREFIX + idea.id)));
        setDraftIds((ids) => [...new Set([...ids, ...recovered.map((idea) => idea.id)])]);
        if (recovered.length) {
          setEditing(recovered[0].id);
          setFilter("all");
        }
      } catch {
        // Each editor reports unavailable browser storage when opened.
      }
    }, (e: unknown) => {
      if (active) setLoadError(e instanceof Error ? e.message : "Could not load ideas.");
    });
    return () => { active = false; };
  }, []);

  function receive(idea: PlanningIdea) {
    setIdeas((list) => [idea, ...(list ?? []).filter((entry) => entry.id !== idea.id)]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)));
  }

  async function save(draft: PlanningDraft, id?: string) {
    const idea: PlanningIdea = await api(id ? `/api/planning-ideas/${id}` : "/api/planning-ideas", {
      method: id ? "PATCH" : "POST", body: JSON.stringify(draft),
    });
    // Use the acknowledged write directly. A separate list fetch failing
    // must not turn a successful save into a duplicate create on retry.
    receive(idea);
    if (id) setEditing(null);
    else setFilter("saved");
    setNotice(id ? "Changes saved." : "Idea saved. You can return to your current work.");
  }

  async function changeStatus(id: string, status: PlanningStatus) {
    if (updating.current) return;
    updating.current = true;
    setBusyId(id);
    setError("");
    try {
      receive(await api(`/api/planning-ideas/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change status.");
    } finally {
      updating.current = false;
      setBusyId(null);
    }
  }

  const visible = (ideas ?? []).filter((idea) => filter === "all" || idea.status === filter);

  return (
    <main className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <p className={HUD + " text-primary"}>Planning / Room for later</p>
        <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Ideas for <span className="text-primary">later</span></h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">Keep the idea. Keep your focus. Save what&apos;s on your mind and revisit it when you&apos;re ready.</p>
      </header>

      <Card className={GLASS}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-xl"><Lightbulb className="h-5 w-5 text-primary" />Capture an idea</CardTitle>
          <CardDescription>Free writing is enough. The details can wait.</CardDescription>
        </CardHeader>
        <CardContent>
          <PlanningIdeaForm draftId="new" onSave={(draft) => save(draft)} onDraftChange={onDraftChange} />
        </CardContent>
      </Card>

      {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
      {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <section aria-labelledby="saved-ideas-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="saved-ideas-heading" className="font-display text-2xl font-semibold">Your ideas</h2>
          <span className={HUD}>{ideas ? `${ideas.length} kept for later` : ""}</span>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter ideas by status">
          {(["all", ...PLANNING_STATUSES] as const).map((status) => (
            <Button key={status} size="sm" variant={filter === status ? "default" : "outline"}
              aria-pressed={filter === status} onClick={() => setFilter(status)}>
              {status === "all" ? "All" : LABELS[status]}{ideas && <span className="ml-1 opacity-70">{status === "all" ? ideas.length : ideas.filter((idea) => idea.status === status).length}</span>}
            </Button>
          ))}
        </div>

        {loadError && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          <p>{loadError}</p><Button variant="outline" size="sm" onClick={async () => {
            try {
              setIdeas(await api("/api/planning-ideas"));
              setLoadError("");
            } catch (e) { setLoadError(e instanceof Error ? e.message : "Could not load ideas."); }
          }}>Retry loading</Button>
        </div>}
        {!ideas && !loadError && <p className="text-sm text-muted-foreground">Loading your ideas…</p>}
        {ideas && visible.length === 0 && <div className={`rounded-2xl border border-dashed p-6 ${GLASS}`}>
          <p className="text-sm text-muted-foreground">{ideas.length === 0 ? "No ideas yet. Capture the first one above." : "No ideas with this status yet."}</p>
        </div>}

        {visible.map((idea) => {
          const open = expanded === idea.id;
          const isEditing = editing === idea.id;
          return (
            <Card key={idea.id} className={GLASS}>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <button type="button" className="min-w-0 flex-1 text-left hover:text-primary"
                    aria-expanded={open} aria-controls={`idea-detail-${idea.id}`}
                    onClick={() => setExpanded(open ? null : idea.id)}>
                    <span className="flex items-start gap-2"><ChevronDown className={`mt-1 h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
                      <span className="break-words font-display text-xl font-semibold">{idea.title}</span></span>
                  </button>
                  <Badge variant="outline" className="shrink-0 border-primary/30 text-primary">{LABELS[idea.status]}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <time dateTime={idea.createdAt}>{new Date(idea.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</time>
                  {draftIds.includes(idea.id) && !isEditing && <span className="text-primary">Unsaved draft — open Edit to resume</span>}
                </div>
                {!open && !isEditing && <p className="line-clamp-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{idea.writing}</p>}
                <div id={`idea-detail-${idea.id}`} hidden={!open || isEditing} className="flex flex-col gap-4 border-t border-white/10 pt-3">
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">{idea.writing}</p>
                  <dl className="grid gap-3 sm:grid-cols-2">
                    {PLANNING_QUESTIONS.filter(({ key }) => idea[key]).map(({ key, label }) => (
                      <div key={key} className="min-w-0"><dt className="mb-1 text-xs font-medium text-primary">{label}</dt>
                        <dd className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{idea[key]}</dd></div>
                    ))}
                  </dl>
                </div>
                {isEditing ? <div className="border-t border-white/10 pt-4">
                  <PlanningIdeaForm key={idea.id} draftId={idea.id} initial={ideaToDraft(idea)}
                    onSave={(draft) => save(draft, idea.id)} onClose={() => setEditing(null)} onDraftChange={onDraftChange} />
                </div> : <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(idea.id)} disabled={busyId !== null}><Pencil className="h-4 w-4" />Edit</Button>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">Status
                    <select aria-label={`Status for ${idea.title}`} className={`h-8 max-w-full rounded-md border px-2 text-sm ${FIELD}`}
                      value={idea.status} disabled={busyId !== null} onChange={(e) => void changeStatus(idea.id, e.target.value as PlanningStatus)}>
                      {PLANNING_STATUSES.map((status) => <option key={status} value={status}>{LABELS[status]}</option>)}
                    </select>
                  </label>
                  <Button size="sm" variant="ghost" disabled={busyId !== null}
                    onClick={() => void changeStatus(idea.id, idea.status === "archived" ? "saved" : "archived")}>
                    {idea.status === "archived" ? <><RotateCcw className="h-4 w-4" />Restore</> : <><Archive className="h-4 w-4" />Archive</>}
                  </Button>
                  {busyId === idea.id && <span role="status" className="text-xs text-muted-foreground">Updating…</span>}
                </div>}
              </CardContent>
            </Card>
          );
        })}
      </section>
      <TodayCoach />
    </main>
  );
}
