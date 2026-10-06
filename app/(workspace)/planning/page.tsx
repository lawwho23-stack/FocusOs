"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Archive, ArrowLeft, Plus, RotateCcw, X } from "lucide-react";
import PlanningBoard from "@/components/planning-board";
import PlanningIdeaForm from "@/components/planning-idea-form";
import TodayCoach from "@/components/today-coach";
import { Button } from "@/components/ui/button";
import {
  PLANNING_DRAFT_PREFIX,
  ideaToDraft,
  parsePlanningDraft,
  type PlanningDraft,
  type PlanningIdea,
  type ChecklistChange,
} from "@/lib/planning-ideas";
import { arrangePlans, type PlanningMove } from "@/lib/planning-order";
import { HUD, api } from "@/lib/ui";
import styles from "@/components/planning-board.module.css";

type Guard = { busy: boolean; unsafeToClose: boolean };
export default function PlanningPage() {
  const [plans, setPlans] = useState<PlanningIdea[] | null>(null);
  const [archived, setArchived] = useState(false);
  const [editor, setEditor] = useState<string | null>(null);
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [closeError, setCloseError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [guard, setGuard] = useState<Guard>({
    busy: false,
    unsafeToClose: false,
  });
  const guardRef = useRef(guard);
  const updating = useRef(false);
  const [retry, setRetry] = useState<{
    id: string;
    destination: PlanningMove;
  } | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const onDraftChange = useCallback((id: string, dirty: boolean) => {
    setDraftIds((ids) =>
      dirty ? [...new Set([...ids, id])] : ids.filter((entry) => entry !== id),
    );
  }, []);
  const onGuardChange = useCallback((next: Guard) => {
    guardRef.current = next;
    setGuard(next);
  }, []);
  const recoverDrafts = useCallback((list: PlanningIdea[]) => {
    try {
      setDraftIds(
        ["new", ...list.map((p) => p.id)].filter((id) =>
          parsePlanningDraft(localStorage.getItem(PLANNING_DRAFT_PREFIX + id)),
        ),
      );
    } catch {
      /* The editor reports browser storage failures when opened. */
    }
  }, []);
  const load = useCallback(async () => {
    try {
      const list: PlanningIdea[] = await api("/api/planning-ideas");
      setPlans(list);
      recoverDrafts(list);
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load plans.");
    }
  }, [recoverDrafts]);
  useEffect(() => {
    let active = true;
    api("/api/planning-ideas").then(
      (list: PlanningIdea[]) => {
        if (active) {
          setPlans(list);
          recoverDrafts(list);
        }
      },
      (e: unknown) => {
        if (active)
          setLoadError(
            e instanceof Error ? e.message : "Could not load plans.",
          );
      },
    );
    Promise.resolve().then(() => {
      if (active) recoverDrafts([]);
    });
    return () => {
      active = false;
    };
  }, [recoverDrafts]);

  function openEditor(id: string) {
    if (updating.current) return;
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    guardRef.current = { busy: false, unsafeToClose: false };
    setGuard(guardRef.current);
    setCloseError("");
    setEditor(id);
  }
  function closeEditor() {
    if (guardRef.current.busy || updating.current) {
      setCloseError("Please wait for your plan to finish saving.");
      return false;
    }
    if (guardRef.current.unsafeToClose) {
      setCloseError(
        "Browser storage is unavailable. Save or explicitly discard this draft before closing.",
      );
      return false;
    }
    setEditor(null);
    setCloseError("");
    return true;
  }
  async function save(draft: PlanningDraft) {
    if (updating.current) throw new Error("Please wait for the current save.");
    updating.current = true;
    setBusy(true);
    try {
      const id = editor === "new" ? undefined : editor;
      const plan: PlanningIdea = await api(
        id ? `/api/planning-ideas/${id}` : "/api/planning-ideas",
        { method: id ? "PATCH" : "POST", body: JSON.stringify(draft) },
      );
      // Apply the acknowledged write directly: an unrelated reload failure must
      // never make a successful creation look failed and encourage duplicates.
      setPlans((current) =>
        id
          ? (current ?? []).map((p) => (p.id === plan.id ? plan : p))
          : [
              plan,
              ...(current ?? []).map((p) =>
                p.status === "saved" ? { ...p, position: p.position + 1 } : p,
              ),
            ],
      );
      setNotice(id ? "Changes saved." : "Plan saved in Idea.");
    } finally {
      updating.current = false;
      setBusy(false);
    }
  }
  async function movePlan(
    id: string,
    destination: PlanningMove,
    snapshot: PlanningIdea[],
  ) {
    if (updating.current) return;
    updating.current = true;
    setBusy(true);
    setError("");
    setRetry(null);
    try {
      setPlans(
        arrangePlans(snapshot, id, destination.status, destination.beforeId),
      );
      const authoritative: PlanningIdea[] = await api(
        `/api/planning-ideas/${id}/move`,
        { method: "POST", body: JSON.stringify(destination) },
      );
      setPlans(authoritative);
      setNotice(
        destination.status === "archived"
          ? "Plan archived. Restore it anytime."
          : "Plan order saved.",
      );
    } catch (e) {
      setPlans(snapshot);
      setRetry({ id, destination });
      setError(
        e instanceof Error
          ? e.message
          : "Could not move your plan. Please try again.",
      );
    } finally {
      updating.current = false;
      setBusy(false);
    }
  }
  async function changeChecklist(id: string, change: ChecklistChange) {
    if (updating.current)
      throw new Error("Another change is saving. Please try again.");
    updating.current = true;
    setBusy(true);
    try {
      const plan: PlanningIdea = await api(
        `/api/planning-ideas/${id}/checklist`,
        {
          method: "POST",
          body: JSON.stringify(change),
        },
      );
      setPlans((current) =>
        (current ?? []).map((p) => (p.id === plan.id ? plan : p)),
      );
    } finally {
      updating.current = false;
      setBusy(false);
    }
  }
  const editingPlan =
    editor === "new" ? undefined : plans?.find((p) => p.id === editor);
  const archivedPlans = (plans ?? [])
    .filter((p) => p.status === "archived")
    .sort((a, b) => a.position - b.position);
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={HUD + " text-primary"}>Planning / Room to grow</p>
          <h1 className={styles.heading}>
            From idea <span>to action.</span>
          </h1>
        </div>
        <div className={styles.headerActions}>
          {draftIds.includes("new") && (
            <Button
              variant="outline"
              onClick={() => openEditor("new")}
              disabled={busy}
            >
              Resume draft
            </Button>
          )}
          <Button
            size="lg"
            onClick={() => openEditor("new")}
            disabled={busy || plans === null}
          >
            <Plus aria-hidden="true" />
            Add plan
          </Button>
        </div>
      </header>
      <div className={styles.toolbar}>
        <div className={styles.views}>
          <Button
            variant={archived ? "ghost" : "secondary"}
            aria-pressed={!archived}
            onClick={() => setArchived(false)}
            disabled={busy}
          >
            Board
          </Button>
          <Button
            variant={archived ? "secondary" : "ghost"}
            aria-pressed={archived}
            onClick={() => setArchived(true)}
            disabled={busy}
          >
            <Archive aria-hidden="true" />
            Archived{" "}
            <span className={styles.count}>{archivedPlans.length}</span>
          </Button>
        </div>
        <span className={HUD}>
          {busy
            ? "Saving…"
            : `${(plans ?? []).filter((p) => p.status !== "archived").length} plans in motion`}
        </span>
      </div>
      {notice && (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      )}
      {error && (
        <div role="alert" className={styles.error}>
          <p>{error}</p>
          <div className="flex gap-2">
            {retry && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void movePlan(retry.id, retry.destination, plans ?? [])
                }
              >
                Retry move
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setRetry(null);
                setError("");
                void load();
              }}
            >
              Reload board
            </Button>
          </div>
        </div>
      )}
      {loadError && (
        <div role="alert" className={styles.error}>
          {loadError}
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Retry loading
          </Button>
        </div>
      )}
      {!plans && !loadError && (
        <p className={styles.subtitle}>Loading your plans…</p>
      )}
      {plans &&
        (archived ? (
          <section aria-label="Archived plans" className={styles.archived}>
            <div>
              <h2 className="font-display text-2xl">Kept for another time</h2>
              <p className={styles.subtitle}>
                Restore a plan to the bottom of Idea whenever you&apos;re ready.
              </p>
            </div>
            {archivedPlans.length === 0 && (
              <p className={styles.empty}>
                No archived plans. Your board has room to grow.
              </p>
            )}
            {archivedPlans.map((p) => (
              <article key={p.id} className={styles.archivedCard}>
                <div>
                  <button
                    className={styles.cardTitle}
                    disabled={busy}
                    onClick={() => openEditor(p.id)}
                  >
                    {p.title}
                  </button>
                  <p className={styles.preview}>{p.writing}</p>
                  {draftIds.includes(p.id) && (
                    <button
                      className={styles.draft}
                      onClick={() => openEditor(p.id)}
                      disabled={busy}
                    >
                      Resume draft
                    </button>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void movePlan(
                      p.id,
                      { status: "saved", beforeId: null },
                      plans,
                    )
                  }
                >
                  <RotateCcw />
                  Restore
                </Button>
              </article>
            ))}
            <Button
              className="self-start"
              variant="ghost"
              onClick={() => setArchived(false)}
            >
              <ArrowLeft />
              Back to board
            </Button>
          </section>
        ) : (
          <PlanningBoard
            plans={plans}
            drafts={draftIds}
            disabled={busy || editor !== null}
            onOpen={openEditor}
            onMove={movePlan}
            onChecklistChange={changeChecklist}
          />
        ))}
      <TodayCoach />
      <Dialog.Root
        open={editor !== null}
        onOpenChange={(open, details) => {
          if (!open && !closeEditor()) details.cancel();
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup
            className={styles.drawer}
            finalFocus={() => opener.current}
          >
            <div className={styles.drawerHeader}>
              <div>
                <p className={HUD + " text-primary"}>
                  {editor === "new" ? "Capture / Idea" : "Plan / Details"}
                </p>
                <Dialog.Title className={styles.drawerTitle}>
                  {editor === "new"
                    ? "Make room for an idea."
                    : (editingPlan?.title ?? "Your plan")}
                </Dialog.Title>
              </div>
              <Dialog.Close
                className={styles.close}
                aria-label="Close plan editor"
                disabled={guard.busy}
              >
                <X aria-hidden="true" />
              </Dialog.Close>
            </div>
            <Dialog.Description className={styles.subtitle}>
              Free writing is enough. The details can wait.
            </Dialog.Description>
            {closeError && (
              <p role="alert" className={styles.error}>
                {closeError}
              </p>
            )}
            {editor && (editor === "new" || editingPlan) && (
              <PlanningIdeaForm
                key={editor}
                draftId={editor}
                initial={editingPlan ? ideaToDraft(editingPlan) : undefined}
                onSave={save}
                onClose={closeEditor}
                onDraftChange={onDraftChange}
                onGuardChange={onGuardChange}
                onSaved={() => {
                  guardRef.current = { busy: false, unsafeToClose: false };
                  setEditor(null);
                  setCloseError("");
                }}
              />
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}
