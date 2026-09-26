"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquareX, RotateCcw, SendHorizontal, X } from "lucide-react";

// Floating AI Coach: a lion bubble you can drag anywhere. Click it to open
// a chat panel. The lion first "sends" the saved report for the day as
// bubbles, then Laww can ask follow-up questions about his data.
//
// Position is remembered in localStorage (a per-browser convenience only).
// The conversation is saved in the database, one thread per day, and only
// clears when Laww presses Reset — closing the panel keeps it.

type Coach = {
  summary: string;
  wins: string[];
  patterns: string[];
  lostTime: string;
  nextAction: string;
};
type CoachResponse = { coach: Coach; generatedAt: string };
type Turn = { id: string; role: "user" | "assistant"; content: string };

const BUBBLE = 60; // px, the lion button
const MARGIN = 16; // px, gap from the screen edge
const PANEL_W = 380;
const PANEL_H = 560;
const POS_KEY = "focusos.coachWidget.pos";

type Pos = { x: number; y: number }; // top-left of the bubble, in px

function clamp(p: Pos): Pos {
  const maxX = window.innerWidth - BUBBLE - MARGIN;
  const maxY = window.innerHeight - BUBBLE - MARGIN;
  return {
    x: Math.min(Math.max(MARGIN, p.x), Math.max(MARGIN, maxX)),
    y: Math.min(Math.max(MARGIN, p.y), Math.max(MARGIN, maxY)),
  };
}

function defaultPos(): Pos {
  return clamp({ x: Infinity, y: Infinity }); // bottom-right corner
}

export default function CoachWidget({
  date,
  dateLabel,
}: {
  date: string;
  dateLabel: string;
}) {
  const [pos, setPos] = useState<Pos | null>(null);
  const [open, setOpen] = useState(false);
  const drag = useRef<{
    startX: number;
    startY: number;
    orig: Pos;
    moved: boolean;
  } | null>(null);

  // First position: saved one, else bottom-right. Runs after mount because
  // window size is only known in the browser.
  useEffect(() => {
    let saved: Pos | null = null;
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPos(saved ? clamp(saved) : defaultPos());
    const onResize = () => setPos((p) => (p ? clamp(p) : p));
    window.addEventListener("resize", onResize);
    // The sidebar "AI Coach" link opens the widget.
    const onOpen = () => setOpen(true);
    window.addEventListener("focusos:open-coach", onOpen);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("focusos:open-coach", onOpen);
    };
  }, []);

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (!pos) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, orig: pos, moved: false };
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    // A few pixels of wobble is still a click, not a drag.
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    d.moved = true;
    setPos(clamp({ x: d.orig.x + dx, y: d.orig.y + dy }));
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      try {
        if (pos) localStorage.setItem(POS_KEY, JSON.stringify(pos));
      } catch {}
    } else {
      setOpen((o) => !o);
    }
  }

  if (!pos) return null;

  // Open the panel toward the middle of the screen from wherever the lion is.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const panelW = Math.min(PANEL_W, vw - 2 * MARGIN);
  const panelH = Math.min(PANEL_H, vh - BUBBLE - 3 * MARGIN);
  const onRight = pos.x + BUBBLE / 2 > vw / 2;
  const onBottom = pos.y + BUBBLE / 2 > vh / 2;
  const left = Math.min(
    Math.max(MARGIN, onRight ? pos.x + BUBBLE - panelW : pos.x),
    vw - panelW - MARGIN
  );
  const top = Math.min(
    Math.max(MARGIN, onBottom ? pos.y - panelH - 12 : pos.y + BUBBLE + 12),
    vh - panelH - MARGIN
  );

  return (
    <>
      {/* Hidden, not unmounted, when closed: a question still being
          answered finishes in the background and reopening is instant. */}
      <div
        role="dialog"
        aria-label="AI Coach chat"
        aria-hidden={!open}
        className={`fixed z-50 flex-col overflow-hidden rounded-2xl border border-white/10 bg-card/95 shadow-2xl shadow-black/60 backdrop-blur ${
          open ? "flex" : "hidden"
        }`}
        style={{ left, top, width: panelW, height: panelH }}
      >
        <CoachChat
          key={date}
          date={date}
          dateLabel={dateLabel}
          visible={open}
          onClose={() => setOpen(false)}
        />
      </div>
      <button
        type="button"
        aria-label={open ? "Close AI Coach" : "Open AI Coach (drag to move)"}
        title="AI Coach — drag to move"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        className={`fixed z-50 flex touch-none select-none items-center justify-center rounded-full bg-card shadow-xl shadow-black/50 ring-2 transition-[box-shadow,transform] hover:scale-105 active:cursor-grabbing ${
          open ? "ring-primary" : "ring-primary/40 hover:ring-primary"
        } cursor-grab`}
        style={{ left: pos.x, top: pos.y, width: BUBBLE, height: BUBBLE }}
      >
        <Image
          src="/coach-lion.png"
          alt=""
          width={44}
          height={44}
          draggable={false}
          priority
        />
      </button>
    </>
  );
}

function CoachChat({
  date,
  dateLabel,
  visible,
  onClose,
}: {
  date: string;
  dateLabel: string;
  visible: boolean;
  onClose: () => void;
}) {
  const [report, setReport] = useState<CoachResponse | null>(null);
  const [loadingReport, setLoadingReport] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState<string | null>(null); // question in flight
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const scrollDown = useCallback((smooth = true) => {
    requestAnimationFrame(() =>
      bottom.current?.scrollIntoView({
        behavior: smooth ? "smooth" : "instant",
        block: "end",
      })
    );
  }, []);

  // Load the saved report, then the saved chat thread (one at a time: the
  // database allows a single connection). Only once the panel is first
  // opened for this day, so switching days never loads a closed chat.
  const started = useRef(false);
  useEffect(() => {
    if (!visible || started.current) return;
    started.current = true;
    // No cancel flag on purpose: this component is keyed by date, so a
    // load can never land on another day, and cancelling on close would
    // leave the chat empty forever (started is already true).
    (async () => {
      try {
        const res = await fetch(`/api/ai/coach?date=${date}`);
        if (res.ok) setReport(await res.json());
        const chat = await fetch(`/api/ai/coach/chat?date=${date}`);
        if (chat.ok) setTurns(await chat.json());
      } catch {
        // Offline or server down: the panel still opens; sending shows the error.
      } finally {
        setLoadingReport(false);
        scrollDown(false);
      }
    })();
  }, [date, visible, scrollDown]);

  async function generate(regenerate: boolean) {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, regenerate }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Coach failed (${res.status})`);
      setReport(body);
      scrollDown();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Coach failed");
    } finally {
      setGenerating(false);
    }
  }

  async function send() {
    const q = input.trim();
    if (!q || sending) return;
    setPending(q);
    setInput("");
    setSending(true);
    setError("");
    scrollDown();
    try {
      const res = await fetch("/api/ai/coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, message: q }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Coach failed (${res.status})`);
      setTurns((t) => [...t, body.question, body.answer]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Coach failed");
      setInput(q); // nothing was saved; give the question back to resend
    } finally {
      setPending(null);
      setSending(false);
      scrollDown();
    }
  }

  // Reset: clears only this day's chat. The report stays.
  async function reset() {
    setConfirmReset(false);
    setError("");
    try {
      const res = await fetch(`/api/ai/coach/chat?date=${date}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setTurns([]);
    } catch {
      setError("Reset failed. Try again.");
    }
  }

  const c = report?.coach;
  const busy = generating || sending;

  return (
    <>
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <Image src="/coach-lion.png" alt="" width={32} height={32} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-semibold leading-tight">
            AI Coach
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {dateLabel} + 7 days before
          </p>
        </div>
        {turns.length > 0 &&
          (confirmReset ? (
            <span className="flex items-center gap-1 text-xs">
              <button
                type="button"
                onClick={reset}
                className="rounded-md bg-destructive/15 px-2 py-1 text-destructive hover:bg-destructive/25"
              >
                Clear chat
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="rounded-md px-2 py-1 text-muted-foreground hover:bg-white/5"
              >
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              disabled={busy}
              aria-label="Reset chat"
              title="Reset chat (keeps the report)"
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-40"
            >
              <MessageSquareX className="h-4 w-4" />
            </button>
          ))}
        {c && (
          <button
            type="button"
            onClick={() => generate(true)}
            disabled={busy}
            aria-label="Regenerate report"
            title="Regenerate report (keeps the chat)"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-40"
          >
            <RotateCcw className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-4">
        {loadingReport ? (
          <LionBubble>Looking at your day…</LionBubble>
        ) : c ? (
          <>
            <LionBubble>{c.summary}</LionBubble>
            {c.wins.length > 0 && (
              <LionBubble title="Wins">
                <List items={c.wins} />
              </LionBubble>
            )}
            {c.patterns.length > 0 && (
              <LionBubble title="Patterns">
                <List items={c.patterns} />
              </LionBubble>
            )}
            <LionBubble title="Lost time">{c.lostTime}</LionBubble>
            <LionBubble title="Next action" highlight>
              {c.nextAction}
            </LionBubble>
            <p className="px-10 font-mono text-[10px] text-muted-foreground">
              Report from {new Date(report.generatedAt).toLocaleString()}
            </p>
          </>
        ) : (
          <>
            <LionBubble>
              I read your tasks, focus sessions, reflections, lost minutes
              and notes, then tell you what the numbers show. Want your
              report for {dateLabel}?
            </LionBubble>
            <div className="pl-10">
              <button
                type="button"
                onClick={() => generate(false)}
                disabled={busy}
                className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {generating ? "Thinking… (about 30s)" : "Coach me"}
              </button>
            </div>
          </>
        )}
        {generating && c && <LionBubble>Rewriting your report…</LionBubble>}

        {turns.map((t) =>
          t.role === "user" ? (
            <UserBubble key={t.id}>{t.content}</UserBubble>
          ) : (
            <LionBubble key={t.id}>{t.content}</LionBubble>
          )
        )}
        {pending && <UserBubble>{pending}</UserBubble>}
        {sending && (
          <LionBubble>
            <span className="inline-flex gap-1">
              <Dot delay="0ms" />
              <Dot delay="150ms" />
              <Dot delay="300ms" />
            </span>
          </LionBubble>
        )}
        {error && (
          <p className="mx-10 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div ref={bottom} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-white/10 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Ask your coach…"
          className="max-h-28 min-h-9 flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/60"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          aria-label="Send"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        >
          <SendHorizontal className="h-4 w-4" />
        </button>
      </form>
    </>
  );
}

function LionBubble({
  children,
  title,
  highlight,
}: {
  children: React.ReactNode;
  title?: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-end gap-2">
      <Image
        src="/coach-lion.png"
        alt=""
        width={28}
        height={28}
        className="mb-0.5 shrink-0"
      />
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm leading-relaxed ${
          highlight
            ? "bg-primary/15 ring-1 ring-primary/40"
            : "bg-white/[0.06]"
        }`}
      >
        {title && (
          <p
            className={`mb-1 font-mono text-[10px] uppercase tracking-[0.2em] ${
              highlight ? "text-primary" : "text-muted-foreground"
            }`}
          >
            {title}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-foreground">
        {children}
      </div>
    </div>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-1">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
          {t}
        </li>
      ))}
    </ul>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground"
      style={{ animationDelay: delay }}
    />
  );
}
