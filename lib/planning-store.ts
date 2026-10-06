import { Prisma, type PrismaClient } from "@prisma/client";
import { db } from "./db";
import { randomUUID } from "node:crypto";
import {
  applyChecklistChange,
  type ChecklistChange,
  type PlanningChecklistItem,
} from "./planning-ideas";
import {
  arrangePlans,
  PlanningMoveError,
  type PlanningMove,
} from "./planning-order";

export const planningOrder = [
  { status: "asc" },
  { position: "asc" },
  { createdAt: "desc" },
  { id: "desc" },
] satisfies Prisma.PlanningIdeaOrderByWithRelationInput[];

export async function planningTransaction<T>(
  run: (tx: Prisma.TransactionClient) => Promise<T>,
  client: PrismaClient = db,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await client.$transaction(run, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034"
      )
        throw error;
      if (attempt === 2)
        throw new PlanningMoveError(
          "The board changed while saving. Reload and try again.",
          409,
        );
    }
  }
  throw new Error("Unreachable transaction retry.");
}

export async function moveInTransaction(
  tx: Prisma.TransactionClient,
  id: string,
  move: PlanningMove,
) {
  const original = await tx.planningIdea.findMany({ orderBy: planningOrder });
  const arranged = arrangePlans(original, id, move.status, move.beforeId);
  const source = original.find((p) => p.id === id)!;
  // Dense positions avoid fractional precision limits; update only affected columns.
  for (const plan of arranged) {
    if (plan.status !== source.status && plan.status !== move.status) continue;
    const previous = original.find((p) => p.id === plan.id)!;
    if (
      previous.status !== plan.status ||
      previous.position !== plan.position
    ) {
      await tx.planningIdea.update({
        where: { id: plan.id },
        data: { status: plan.status, position: plan.position },
      });
    }
  }
  return tx.planningIdea.findMany({ orderBy: planningOrder });
}

export async function createPlan(
  data: Prisma.PlanningIdeaCreateInput,
  client: PrismaClient = db,
) {
  return planningTransaction(async (tx) => {
    // Capture always enters Idea, irrespective of a legacy caller's status field.
    const column = await tx.planningIdea.findMany({
      where: { status: "saved" },
      orderBy: planningOrder,
    });
    for (const [position, plan] of column.entries())
      await tx.planningIdea.update({
        where: { id: plan.id },
        data: { position: position + 1 },
      });
    return tx.planningIdea.create({
      data: { ...data, status: "saved", position: 0 },
    });
  }, client);
}

export async function updatePlan(
  id: string,
  data: Prisma.PlanningIdeaUncheckedUpdateInput,
  client: PrismaClient = db,
) {
  return planningTransaction(async (tx) => {
    const previous = await tx.planningIdea.findUnique({ where: { id } });
    if (!previous) throw new PlanningMoveError("Idea not found.", 404);
    const { status, ...content } = data;
    await tx.planningIdea.update({ where: { id }, data: content });
    if (typeof status === "string" && status !== previous.status)
      await moveInTransaction(tx, id, { status, beforeId: null });
    return tx.planningIdea.findUniqueOrThrow({ where: { id } });
  }, client);
}

export function planningError(error: unknown, fallback: string) {
  if (error instanceof PlanningMoveError)
    return Response.json({ error: error.message }, { status: error.status });
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  )
    return Response.json({ error: "Idea not found." }, { status: 404 });
  return Response.json({ error: fallback }, { status: 500 });
}

export async function updateChecklist(
  id: string,
  change: ChecklistChange,
  client: PrismaClient = db,
) {
  const taskId = randomUUID();
  return planningTransaction(async (tx) => {
    const plan = await tx.planningIdea.findUnique({ where: { id } });
    if (!plan) throw new PlanningMoveError("Idea not found.", 404);
    let checklist: PlanningChecklistItem[];
    try {
      // Apply one operation to the latest list inside the transaction. Replacing
      // a client snapshot would lose tasks added by another tab.
      checklist = applyChecklistChange(
        plan.checklist as PlanningChecklistItem[],
        change,
        taskId,
      );
    } catch (error) {
      throw new PlanningMoveError(
        error instanceof Error ? error.message : "Could not change this task.",
        409,
      );
    }
    return tx.planningIdea.update({ where: { id }, data: { checklist } });
  }, client);
}
