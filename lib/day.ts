// Small date helpers shared by the API routes.
// A "day" is a plain YYYY-MM-DD string. The database stores it as a DATE.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(s: unknown): s is string {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00");
  return !Number.isNaN(d.getTime());
}

// "Today" as YYYY-MM-DD in Laww's timezone, not the server's (Vercel runs
// UTC). Accepts an optional override (?date=...) so any day can be shown.
export function resolveDay(input: string | null): string | null {
  if (input === null) return instantToDay(new Date());
  return isValidDateString(input) ? input : null;
}

// A DATE column value: midnight UTC of that day. Must be UTC — a local
// midnight on a UTC+7 machine is 17:00 the day before in UTC, and Prisma
// then stores the previous day.
export function dayToDate(day: string): Date {
  return new Date(day + "T00:00:00Z");
}

// Laww's timezone. Thailand has no daylight saving, so a fixed offset works.
// Used only where a real clock time (a session's startedAt) must be mapped
// to a calendar day.
export const TZ_OFFSET = "+07:00";

// [start, end) of a local day as real instants, for startedAt queries.
export function dayBounds(day: string): { gte: Date; lt: Date } {
  const gte = new Date(`${day}T00:00:00${TZ_OFFSET}`);
  return { gte, lt: new Date(gte.getTime() + 24 * 60 * 60 * 1000) };
}

// Shift a YYYY-MM-DD string by n days (n may be negative).
export function addDays(day: string, n: number): string {
  const d = dayToDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Local calendar day for a real instant, in TZ_OFFSET.
export function instantToDay(t: Date): string {
  const offsetMs = 7 * 60 * 60 * 1000;
  return new Date(t.getTime() + offsetMs).toISOString().slice(0, 10);
}
