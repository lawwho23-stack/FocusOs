export const PLANNING_STATUSES = ["saved", "planned", "done", "archived"] as const;
export type PlanningStatus = (typeof PLANNING_STATUSES)[number];

export const PLANNING_QUESTIONS = [
  { key: "problem", label: "What problem does this solve?" },
  { key: "audience", label: "Who is it for?" },
  { key: "why", label: "Why do I want to pursue it?" },
  { key: "firstStep", label: "What would the first small step be?" },
  { key: "revisitWhen", label: "When should I revisit it?" },
] as const;

export type PlanningDraft = {
  title: string;
  writing: string;
} & Record<(typeof PLANNING_QUESTIONS)[number]["key"], string>;

export const EMPTY_PLANNING_DRAFT: PlanningDraft = {
  title: "", writing: "", problem: "", audience: "", why: "", firstStep: "", revisitWhen: "",
};

export type PlanningIdea = {
  id: string;
  title: string;
  writing: string;
  problem: string | null;
  audience: string | null;
  why: string | null;
  firstStep: string | null;
  revisitWhen: string | null;
  status: PlanningStatus;
  createdAt: string;
  updatedAt: string;
};

type IdeaInput = Omit<PlanningIdea, "id" | "createdAt" | "updatedAt" | "status"> & { status?: PlanningStatus };
type CreateInput = Pick<IdeaInput, "title" | "writing"> & Partial<IdeaInput>;
type Result<T> = { data: T } | { error: string };

export function parsePlanningIdea(body: unknown, mode: "create"): Result<CreateInput>;
export function parsePlanningIdea(body: unknown, mode: "update"): Result<Partial<IdeaInput>>;
export function parsePlanningIdea(body: unknown, mode: "create" | "update"): Result<Partial<IdeaInput>> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "A JSON object is required." };
  const input = body as Record<string, unknown>;
  const data: Partial<IdeaInput> = {};
  if (mode === "create" || input.writing !== undefined) {
    if (typeof input.writing !== "string" || !input.writing.trim()) return { error: "Write your idea before saving." };
    if (input.writing.length > 50000) return { error: "Writing must be 50,000 characters or fewer." };
    data.writing = input.writing.trim();
  }
  if (mode === "create" || input.title !== undefined) {
    if (input.title !== undefined && typeof input.title !== "string") return { error: "Title must be text." };
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (title.length > 200) return { error: "Title must be 200 characters or fewer." };
    data.title = title || Array.from(data.writing?.split(/\r?\n/)[0] ?? "").slice(0, 80).join("");
    if (!data.title) return { error: "Title cannot be empty without writing to generate it from." };
  }
  for (const { key } of PLANNING_QUESTIONS) {
    const value = input[key];
    if (value === undefined) continue;
    if (value !== null && typeof value !== "string") return { error: `${key} must be text or null.` };
    if (typeof value === "string" && value.length > 10000) return { error: `${key} must be 10,000 characters or fewer.` };
    data[key] = typeof value === "string" ? value.trim() || null : null;
  }
  if (input.status !== undefined) {
    if (!PLANNING_STATUSES.includes(input.status as PlanningStatus)) return { error: "Invalid planning status." };
    data.status = input.status as PlanningStatus;
  }
  if (!Object.keys(data).length) return { error: "No editable fields were supplied." };
  return { data };
}

export const PLANNING_DRAFT_PREFIX = "focusos:planning-draft:";

// Validate stored drafts before restoring them; old or corrupt browser data
// must never overwrite a working editor.
export function parsePlanningDraft(raw: string | null): PlanningDraft | null {
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw);
    if (stored?.version !== 1 || !stored.draft || typeof stored.draft !== "object") return null;
    const draft = { ...EMPTY_PLANNING_DRAFT };
    for (const key of Object.keys(draft) as (keyof PlanningDraft)[]) {
      if (typeof stored.draft[key] !== "string") return null;
      draft[key] = stored.draft[key];
    }
    return draft;
  } catch {
    return null;
  }
}

export function ideaToDraft(idea: PlanningIdea): PlanningDraft {
  return {
    title: idea.title, writing: idea.writing, problem: idea.problem ?? "",
    audience: idea.audience ?? "", why: idea.why ?? "",
    firstStep: idea.firstStep ?? "", revisitWhen: idea.revisitWhen ?? "",
  };
}
