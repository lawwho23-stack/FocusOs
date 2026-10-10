export const MISSION_ICONS = [
  "compass", "heart", "globe", "rocket", "book", "leaf", "users", "mountain",
] as const;
export type MissionIcon = (typeof MISSION_ICONS)[number];
export type MissionStep = { id: string; title: string; completed: boolean };
export type MissionDraft = {
  title: string;
  writing: string;
  icon: MissionIcon;
  checklist: MissionStep[];
};
export type LifeMission = MissionDraft & {
  id: string;
  createdAt: string;
  updatedAt: string;
};
export const EMPTY_MISSION: MissionDraft = {
  title: "", writing: "", icon: "compass", checklist: [],
};
export const MISSION_DRAFT_PREFIX = "focusos:life-mission-draft:";

function validDraft(body: unknown): body is MissionDraft {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const input = body as Record<string, unknown>;
  if (typeof input.title !== "string" || input.title.length > 200 ||
      typeof input.writing !== "string" || input.writing.length > 50000 ||
      !MISSION_ICONS.includes(input.icon as MissionIcon) ||
      !Array.isArray(input.checklist) || input.checklist.length > 100) return false;
  const ids = new Set<string>();
  return input.checklist.every((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        typeof item.id !== "string" || !item.id.trim() || item.id.length > 200 ||
        ids.has(item.id) || typeof item.title !== "string" ||
        item.title.length > 200 || typeof item.completed !== "boolean") return false;
    ids.add(item.id);
    return true;
  });
}

export function parseLifeMission(body: unknown): { data: MissionDraft } | { error: string } {
  if (!validDraft(body)) return { error: "Use a title up to 200 characters, mission text up to 50,000 characters, a valid icon, and up to 100 steps with text up to 200 characters." };
  if (!body.title.trim() || !body.writing.trim()) return { error: "Write a title and your mission before saving." };
  if (body.checklist.some((item) => !item.title.trim())) return { error: "Write text for each checklist step before saving." };
  return { data: {
    title: body.title.trim(), writing: body.writing.trim(), icon: body.icon,
    checklist: body.checklist.map(({ id, title, completed }) => ({ id, title: title.trim(), completed })),
  } };
}

export function checklistProgress(items: MissionStep[]) {
  const completed = items.filter((item) => item.completed).length;
  return { completed, total: items.length, percent: items.length ? Math.round(completed / items.length * 100) : 0 };
}

export function parseMissionDraft(raw: string | null): MissionDraft | null {
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw);
    return stored?.version === 1 && validDraft(stored.draft) ? stored.draft : null;
  } catch { return null; }
}

export function missionToDraft(mission: LifeMission): MissionDraft {
  return { title: mission.title, writing: mission.writing, icon: mission.icon, checklist: mission.checklist };
}
