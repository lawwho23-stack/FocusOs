"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  EMPTY_PLANNING_DRAFT,
  PLANNING_DRAFT_PREFIX,
  PLANNING_QUESTIONS,
  parsePlanningDraft,
  type PlanningDraft,
} from "@/lib/planning-ideas";
import { FIELD } from "@/lib/ui";

export default function PlanningIdeaForm({
  draftId,
  initial = EMPTY_PLANNING_DRAFT,
  onSave,
  onClose,
  onDraftChange,
  onSaved,
  onGuardChange,
}: {
  draftId: string;
  initial?: PlanningDraft;
  onSave: (draft: PlanningDraft) => Promise<void>;
  onClose?: () => void;
  onSaved: () => void;
  onGuardChange: (guard: { busy: boolean; unsafeToClose: boolean }) => void;
  onDraftChange: (id: string, dirty: boolean) => void;
}) {
  const [baseline] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const saving = useRef(false);
  const dirtyRef = useRef(false);
  const storageFailed = useRef(false);
  function reportGuard() {
    onGuardChange({
      busy: saving.current,
      unsafeToClose: dirtyRef.current && storageFailed.current,
    });
  }
  const storageKey = PLANNING_DRAFT_PREFIX + draftId;
  const prefix = `idea-${draftId}`;

  useEffect(() => {
    let active = true;
    // Restore only after hydration; an empty initial render must never write
    // over the browser's existing draft.
    Promise.resolve().then(() => {
      if (!active) return;
      try {
        const recovered = parsePlanningDraft(localStorage.getItem(storageKey));
        if (recovered) {
          setDraft(recovered);
          setDirty(true);
          dirtyRef.current = true;
          onDraftChange(draftId, true);
        }
      } catch {
        storageFailed.current = true;
        setStorageError(
          "Browser draft recovery is unavailable. Save before leaving this page.",
        );
      }
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [storageKey, draftId, onDraftChange]);

  useEffect(() => {
    if (!dirty || !storageError) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, storageError]);

  function change(key: keyof PlanningDraft, value: string) {
    const next = { ...draft, [key]: value };
    setDraft(next);
    setDirty(true);
    dirtyRef.current = true;
    setError("");
    onDraftChange(draftId, true);
    try {
      // Persist on each input, rather than a delayed timer that could lose
      // the final keystrokes on refresh or navigation.
      localStorage.setItem(
        storageKey,
        JSON.stringify({ version: 1, draft: next }),
      );
      setStorageError("");
      storageFailed.current = false;
    } catch {
      storageFailed.current = true;
      setStorageError(
        "This draft could not be kept in your browser. Save before leaving this page.",
      );
    }
    reportGuard();
  }

  function clearStoredDraft() {
    let cleared = true;
    try {
      localStorage.removeItem(storageKey);
      setStorageError("");
      storageFailed.current = false;
    } catch {
      cleared = false;
      setStorageError(
        "Could not clear the browser draft. An old draft may reappear after refresh.",
      );
    }
    setDirty(false);
    dirtyRef.current = false;
    reportGuard();
    onDraftChange(draftId, false);
    return cleared;
  }

  if (!ready)
    return (
      <p className="text-sm text-muted-foreground">
        Checking for an unfinished draft…
      </p>
    );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (saving.current || !draft.writing.trim()) return;
        saving.current = true;
        reportGuard();
        setBusy(true);
        setError("");
        try {
          await onSave(draft);
          const cleared = clearStoredDraft();
          setDraft(EMPTY_PLANNING_DRAFT);
          saving.current = false;
          reportGuard();
          if (cleared) onSaved();
        } catch (e) {
          setError(
            e instanceof Error
              ? e.message
              : "Could not save. Your writing is still here.",
          );
        } finally {
          saving.current = false;
          reportGuard();
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4">
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor={`${prefix}-writing`}>Write your idea</Label>
            {dirty && (
              <span className="text-xs text-primary" role="status">
                Unsaved draft
              </span>
            )}
          </div>
          <Textarea
            id={`${prefix}-writing`}
            value={draft.writing}
            onChange={(e) => change("writing", e.target.value)}
            maxLength={50000}
            required
            placeholder="Capture what's on your mind. You can work out the details later…"
            className={`min-h-44 resize-y leading-relaxed ${FIELD}`}
          />
        </div>
        <details className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 text-sm text-foreground/80">
            Develop this idea{" "}
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              Optional <ChevronDown className="h-4 w-4" />
            </span>
          </summary>
          <div className="grid gap-4 pt-4 pb-2">
            <div className="grid gap-2">
              <Label htmlFor={`${prefix}-title`}>Title</Label>
              <Input
                id={`${prefix}-title`}
                value={draft.title}
                maxLength={200}
                onChange={(e) => change("title", e.target.value)}
                className={FIELD}
                placeholder="Leave blank to use the first line of your idea"
              />
            </div>
            {PLANNING_QUESTIONS.map(({ key, label }) => (
              <div key={key} className="grid gap-2">
                <Label htmlFor={`${prefix}-${key}`}>{label}</Label>
                <Textarea
                  id={`${prefix}-${key}`}
                  value={draft[key]}
                  maxLength={10000}
                  onChange={(e) => change(key, e.target.value)}
                  className={`min-h-20 ${FIELD}`}
                  placeholder={
                    key === "revisitWhen"
                      ? "e.g. After finishing my current app"
                      : "It's okay to leave this for later"
                  }
                />
              </div>
            ))}
          </div>
        </details>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {storageError && (
          <p role="alert" className="text-sm text-destructive">
            {storageError}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            disabled={busy || !dirty || !draft.writing.trim()}
          >
            <Save className="h-4 w-4" />
            {busy
              ? "Saving…"
              : draftId === "new"
                ? "Save plan"
                : "Save changes"}
          </Button>
          {dirty && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (!window.confirm("Discard this unsaved draft?")) return;
                clearStoredDraft();
                setDraft(baseline);
                setError("");
              }}
            >
              Discard draft
            </Button>
          )}
          {onClose && (
            <Button type="button" variant="ghost" onClick={onClose}>
              Close editor
            </Button>
          )}
        </div>
      </fieldset>
      <p className="text-xs text-muted-foreground">
        {dirty && !storageError
          ? "Draft kept in this browser. Save to keep it in FocusOS."
          : "Capture now. Return to your current work."}
      </p>
    </form>
  );
}
