// Small date helpers shared by mission routes.
// A "day" is a plain YYYY-MM-DD string. The database stores it as a DATE.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(s: unknown): s is string {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00");
  return !Number.isNaN(d.getTime());
}

// Server's "today" as YYYY-MM-DD. Accepts an optional override (?date=...)
// so the dashboard can be tested for any day.
export function resolveDay(input: string | null): string | null {
  if (input === null) {
    const now = new Date();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${m}-${d}`;
  }
  return isValidDateString(input) ? input : null;
}

export function dayToDate(day: string): Date {
  return new Date(day + "T00:00:00");
}
