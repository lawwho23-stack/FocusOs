"use client";

import { useEffect, useRef, useState } from "react";
import {
  DragDropProvider,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { OptimisticSortingPlugin } from "@dnd-kit/dom/sortable";
import {
  PointerSensor,
  PointerActivationConstraints,
  KeyboardSensor,
  Feedback,
  Accessibility,
} from "@dnd-kit/dom";
import { CollisionPriority, type CollisionDetector } from "@dnd-kit/abstract";
import {
  defaultCollisionDetection,
  pointerIntersection,
} from "@dnd-kit/collision";
import { move } from "@dnd-kit/helpers";
import { Archive, GripVertical } from "lucide-react";
import PlanningChecklist from "./planning-checklist";
import {
  BOARD_STATUSES,
  PLANNING_LABELS,
  arrangePlans,
  type PlanningMove,
} from "@/lib/planning-order";
import type {
  ChecklistChange,
  PlanningIdea,
  PlanningStatus,
} from "@/lib/planning-ideas";
import styles from "./planning-board.module.css";

type Props = {
  plans: PlanningIdea[];
  drafts: string[];
  disabled: boolean;
  onOpen: (id: string) => void;
  onChecklistChange: (id: string, change: ChecklistChange) => Promise<void>;
  onMove: (
    id: string,
    destination: PlanningMove,
    snapshot: PlanningIdea[],
  ) => Promise<void>;
};
const instructions =
  "Drag the card background to move it. For keyboard movement, focus a drag handle. Press Space or Enter to pick up, use arrow keys to move, and press Space or Enter to drop. Escape cancels.";

// On pointer input, the cursor decides the column. A neighboring card's
// overlapping edge must not capture a drop inside an empty column.
const boardCollision: CollisionDetector = (input) =>
  input.dragOperation.activatorEvent?.type === "keydown"
    ? defaultCollisionDetection(input)
    : pointerIntersection(input);

export default function PlanningBoard({
  plans,
  drafts,
  disabled,
  onOpen,
  onMove,
  onChecklistChange,
}: Props) {
  const [preview, setPreview] = useState<PlanningIdea[] | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [reduced, setReduced] = useState(false);
  const snapshot = useRef(plans);
  const live = useRef(plans);
  const dragging = useRef(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const visible = preview ?? plans;
  return (
    <>
      <p id="planning-drag-help" className="sr-only">
        {instructions}
      </p>
      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </p>
      <DragDropProvider
        sensors={[
          KeyboardSensor,
          PointerSensor.configure({
            activatorElements: (source) => [source.element],
            preventActivation(event, source) {
              const target = event.target as HTMLElement;
              if (source.handle?.contains(target)) return false;
              return !!target.closest(
                "button, input, textarea, select, label, form, a, [data-card-control]",
              );
            },
            activationConstraints(event) {
              return event.pointerType === "touch"
                ? [
                    new PointerActivationConstraints.Delay({
                      value: 220,
                      tolerance: 5,
                    }),
                  ]
                : [new PointerActivationConstraints.Distance({ value: 5 })];
            },
          }),
        ]}
        plugins={(defaults) => [
          ...defaults.filter(
            (plugin) => plugin !== Feedback && plugin !== Accessibility,
          ),
          Accessibility.configure({
            screenReaderInstructions: { draggable: instructions },
            announcements: {
              dragstart: (event: DragStartEvent) =>
                `Picked up ${event.operation.source?.data.title ?? "plan"}.`,
              dragend: (event: DragEndEvent) =>
                event.canceled
                  ? "Move canceled. Original order restored."
                  : "Plan dropped. Saving its position.",
            },
          }),
          Feedback.configure({
            dropAnimation: reduced ? null : undefined,
            keyboardTransition: reduced ? null : undefined,
          }),
        ]}
        onBeforeDragStart={(event) => {
          if (disabled) event.preventDefault();
        }}
        onDragStart={(event) => {
          dragging.current = true;
          snapshot.current = plans;
          live.current = plans;
          setAnnouncement(
            `Picked up ${plans.find((p) => p.id === event.operation.source?.id)?.title ?? "plan"}. ${instructions}`,
          );
        }}
        onDragOver={(event) => {
          if (
            !dragging.current ||
            !event.operation.source ||
            !event.operation.target
          )
            return;
          const targetColumn = BOARD_STATUSES.find(
            (status) => status === event.operation.target?.id,
          );
          const groups = Object.fromEntries(
            BOARD_STATUSES.map((status) => [
              status,
              live.current.filter((p) => p.status === status).map((p) => p.id),
            ]),
          );
          const result = move(groups, event);
          // An empty column has no sortable card to supply an insertion index.
          // Use our snapshot directly, including after a cross-column remount.
          const next = targetColumn
            ? arrangePlans(
                live.current,
                String(event.operation.source.id),
                targetColumn,
                null,
              )
            : [
                ...live.current.filter((p) => p.status === "archived"),
                ...BOARD_STATUSES.flatMap((status) =>
                  result[status].map((id, position) => ({
                    ...live.current.find((p) => p.id === id)!,
                    status,
                    position,
                  })),
                ),
              ];
          live.current = next;
          setPreview(next);
          const card = next.find((p) => p.id === event.operation.source?.id);
          if (card)
            setAnnouncement(
              `${card.title}, ${PLANNING_LABELS[card.status]}, position ${card.position + 1}.`,
            );
        }}
        onDragEnd={(event) => {
          dragging.current = false;
          const before = snapshot.current;
          const id = String(event.operation.source?.id ?? "");
          const card = live.current.find((p) => p.id === id);
          setPreview(null);
          if (event.canceled || !event.operation.target || !card) {
            setAnnouncement("Move canceled. Original order restored.");
            return;
          }
          const old = before.find((p) => p.id === id);
          if (old?.status === card.status && old.position === card.position) {
            setAnnouncement("Order unchanged.");
            return;
          }
          const column = live.current.filter((p) => p.status === card.status);
          void onMove(
            id,
            {
              status: card.status,
              beforeId:
                column[column.findIndex((p) => p.id === id) + 1]?.id ?? null,
            },
            before,
          );
          setAnnouncement(
            `Saving ${card.title} in ${PLANNING_LABELS[card.status]}.`,
          );
        }}
      >
        <div
          className={styles.board}
          aria-label="Planning board"
          aria-busy={disabled}
        >
          {BOARD_STATUSES.map((status, number) => {
            const column = visible
              .filter((p) => p.status === status)
              .sort((a, b) => a.position - b.position);
            return (
              <Column
                key={status}
                status={status}
                count={column.length}
                number={number}
                disabled={disabled}
              >
                {column.map((plan, index) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    index={index}
                    draft={drafts.includes(plan.id)}
                    locked={disabled}
                    disabled={disabled || preview !== null}
                    reduced={reduced}
                    onOpen={() => {
                      if (!dragging.current) onOpen(plan.id);
                    }}
                    onMove={(destination) => {
                      if (!dragging.current)
                        void onMove(plan.id, destination, plans);
                    }}
                    onChecklistChange={(change) =>
                      onChecklistChange(plan.id, change)
                    }
                  />
                ))}
              </Column>
            );
          })}
        </div>
      </DragDropProvider>
    </>
  );
}

function Column({
  status,
  count,
  number,
  disabled,
  children,
}: {
  status: PlanningStatus;
  count: number;
  number: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const { ref, isDropTarget } = useDroppable({
    id: status,
    type: "column",
    accept: "plan",
    collisionPriority: CollisionPriority.Low,
    collisionDetector: boardCollision,
    disabled,
  });
  return (
    <section
      ref={ref}
      className={`${styles.column} ${isDropTarget ? styles.over : ""}`}
      aria-labelledby={`column-${status}`}
      data-column={status}
    >
      <div className={styles.columnHeading}>
        <span className={styles.columnNumber}>0{number + 1}</span>
        <h2 id={`column-${status}`}>{PLANNING_LABELS[status]}</h2>
        <span className={styles.count}>{count}</span>
      </div>
      <div className={styles.cards}>{children}</div>
      <div className={styles.dropZone} aria-hidden="true">
        {count ? "Drop a plan here" : "Room for your next plan"}
      </div>
    </section>
  );
}

function PlanCard({
  plan,
  index,
  draft,
  locked,
  disabled,
  reduced,
  onOpen,
  onMove,
  onChecklistChange,
}: {
  plan: PlanningIdea;
  index: number;
  draft: boolean;
  locked: boolean;
  disabled: boolean;
  reduced: boolean;
  onOpen: () => void;
  onMove: (destination: PlanningMove) => void;
  onChecklistChange: (change: ChecklistChange) => Promise<void>;
}) {
  const { ref, handleRef, isDragSource, isDropTarget } = useSortable({
    id: plan.id,
    index,
    group: plan.status,
    type: "plan",
    accept: "plan",
    disabled: locked,
    data: { title: plan.title },
    collisionDetector: boardCollision,
    // React owns the live preview. Prevent a second writer from moving DOM
    // nodes across columns while React is reconciling them.
    plugins: (defaults) =>
      defaults.filter((plugin) => plugin !== OptimisticSortingPlugin),
    transition: reduced ? null : { duration: 180 },
  });
  return (
    <article
      ref={ref}
      data-plan-id={plan.id}
      style={{ touchAction: "none" }}
      onClick={(event) => {
        if (
          disabled ||
          (event.target as HTMLElement).closest(
            "button, details, select, input, textarea, a, label, form, [data-card-control]",
          ) ||
          window.getSelection()?.toString()
        )
          return;
        onOpen();
      }}
      className={`${styles.card} ${isDragSource ? styles.dragging : ""} ${isDropTarget ? styles.target : ""}`}
    >
      <div className={styles.cardTop}>
        <button
          className={styles.cardTitle}
          onClick={onOpen}
          disabled={disabled}
        >
          {plan.title}
        </button>
        <div className={styles.cardActions}>
          <button
            className={styles.archiveButton}
            aria-label={`Archive ${plan.title}`}
            title="Archive plan"
            disabled={disabled}
            onClick={() => onMove({ status: "archived", beforeId: null })}
          >
            <Archive size={14} aria-hidden="true" />
          </button>
          <button
            ref={handleRef}
            className={styles.handle}
            aria-label={`Drag ${plan.title}`}
            aria-describedby="planning-drag-help"
            disabled={locked}
            style={{ touchAction: "none" }}
          >
            <GripVertical size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      <p className={styles.preview}>{plan.writing}</p>
      {draft && (
        <button className={styles.draft} onClick={onOpen} disabled={disabled}>
          Resume draft <span aria-hidden="true">↗</span>
        </button>
      )}
      <PlanningChecklist
        items={plan.checklist ?? []}
        disabled={disabled}
        onChange={onChecklistChange}
      />
    </article>
  );
}
