// True when Laww actually wrote something. A row can exist holding only the
// coach's answer (aiSummary); that must not count as "reflected".
export function hasReflection(
  r: {
    completedWork: string | null;
    blockers: string | null;
    distractions: string | null;
    energyLevel: number | null;
    lesson: string | null;
    nextStartAction: string | null;
    minutesLost: number | null;
  } | null
): boolean {
  if (!r) return false;
  return [
    r.completedWork,
    r.blockers,
    r.distractions,
    r.energyLevel,
    r.lesson,
    r.nextStartAction,
    r.minutesLost,
  ].some((v) => v !== null && v !== "");
}
