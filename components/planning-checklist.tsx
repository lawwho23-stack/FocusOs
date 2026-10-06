"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import type {
  ChecklistChange,
  PlanningChecklistItem,
} from "@/lib/planning-ideas";
import styles from "./planning-board.module.css";

export default function PlanningChecklist({
  items,
  disabled,
  onChange,
}: {
  items: PlanningChecklistItem[];
  disabled: boolean;
  onChange: (change: ChecklistChange) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<ChecklistChange | null>(null);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<{
    id: string;
    completed: boolean;
  } | null>(null);
  const pending = useRef(false);
  const locked = disabled || saving;
  const visibleItems = items.map((item) =>
    item.id === toggling?.id
      ? { ...item, completed: toggling.completed }
      : item,
  );
  async function save(change: ChecklistChange) {
    if (pending.current || disabled) return;
    pending.current = true;
    setSaving(true);
    setError("");
    if (change.action === "toggle") setToggling(change);
    try {
      await onChange(change);
      if (change.action === "add") setTitle("");
      setRetry(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your task.");
      setRetry(change);
    } finally {
      pending.current = false;
      setSaving(false);
      setToggling(null);
    }
  }
  return (
    <div className={styles.checklist} data-card-control>
      <div className={styles.checklistHeading}>
        <span>Tasks</span>
        <span
          aria-label={`${visibleItems.filter((item) => item.completed).length} of ${items.length} tasks complete`}
        >
          {visibleItems.filter((item) => item.completed).length} /{" "}
          {items.length}
        </span>
      </div>
      <ul className={styles.taskList}>
        {visibleItems.map((item) => (
          <li key={item.id} className={styles.task}>
            <label
              className={item.completed ? styles.completedTask : undefined}
            >
              <input
                type="checkbox"
                checked={item.completed}
                disabled={locked}
                onChange={(e) =>
                  void save({
                    action: "toggle",
                    id: item.id,
                    completed: e.target.checked,
                  })
                }
              />
              <span>{item.title}</span>
            </label>
            <button
              type="button"
              className={styles.removeTask}
              aria-label={`Remove ${item.title}`}
              disabled={locked}
              onClick={() => void save({ action: "remove", id: item.id })}
            >
              <X size={13} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className={styles.addTask}
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim()) void save({ action: "add", title: title.trim() });
        }}
      >
        <input
          aria-label="New task"
          placeholder="Add a task…"
          value={title}
          maxLength={200}
          disabled={locked || items.length >= 100}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button
          type="submit"
          aria-label="Add task"
          disabled={locked || !title.trim() || items.length >= 100}
        >
          <Plus size={16} aria-hidden="true" />
        </button>
      </form>
      {saving && (
        <span className="sr-only" role="status">
          Saving task…
        </span>
      )}
      {error && (
        <div className={styles.taskError}>
          <p role="alert">{error}</p>
          {retry && (
            <button
              type="button"
              disabled={locked}
              onClick={() => void save(retry)}
            >
              Retry task save
            </button>
          )}
        </div>
      )}
    </div>
  );
}
