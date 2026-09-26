// Shared class strings so every page looks like the same app.
export const HUD =
  "text-[11px] uppercase tracking-[0.2em] text-muted-foreground";
export const GLASS =
  "border-white/10 bg-card/80 shadow-xl shadow-black/40 backdrop-blur";
export const FIELD = "border-white/10 bg-white/[0.04]";
export const DOT_COLORS = ["#f5b90d", "#8b7cf6", "#3ddc97", "#f472b6", "#4cc3ff"];

// Browser-side fetch helper: JSON in, JSON out, throws the API's error text.
// Calls run ONE AT A TIME through a queue: DATABASE_URL allows a single
// pooled connection, and the sidebar and a page loading together would
// otherwise race for it until Prisma times out (P2024).
let queue: Promise<unknown> = Promise.resolve();

export function api(path: string, init?: RequestInit): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const next = queue.then(() => request(path, init));
  queue = next.catch(() => {});
  return next;
}

async function request(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

// Today as YYYY-MM-DD in the browser's timezone.
export function todayKey(): string {
  return new Date().toLocaleDateString("en-CA");
}

// "Sep 26" style label for a YYYY-MM-DD day.
export function fmtDay(d: string, withWeekday = false): string {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    ...(withWeekday ? { weekday: "short" } : {}),
    month: "short",
    day: "numeric",
  });
}

export function isValidDay(s: string | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}
