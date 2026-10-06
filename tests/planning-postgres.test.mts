import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import * as store from "../lib/planning-store";
import {
  createPlan,
  updatePlan,
  moveInTransaction,
  planningTransaction,
  planningOrder,
} from "../lib/planning-store";

// Never fall back to the project's DATABASE_URL. This suite only accepts the
// task-owned disposable PostgreSQL instance with an explicit test database.
const url = process.env.PLANNING_TEST_DATABASE_URL;
if (!url)
  throw new Error(
    "Set PLANNING_TEST_DATABASE_URL to the isolated test cluster.",
  );
const parsed = new URL(url);
if (
  parsed.hostname !== "127.0.0.1" ||
  parsed.port !== "55439" ||
  parsed.pathname !== "/focusos_kanban_test"
)
  throw new Error("Refusing a non-isolated test database.");
const client = new PrismaClient({ datasources: { db: { url } } });
test.before(async () => {
  const directory = await client.$queryRawUnsafe<{ data_directory: string }[]>(
    "SHOW data_directory",
  );
  if (directory[0]?.data_directory !== "/private/tmp/focusos-kanban-pg/data")
    throw new Error(
      "Refusing to reset a cluster not owned by this test workflow.",
    );
  await client.$executeRawUnsafe('DROP TABLE IF EXISTS "PlanningIdea"');
  await client.$executeRawUnsafe('DROP TYPE IF EXISTS "PlanningStatus"');
  const apply = async (path: string) => {
    const sql = await readFile(new URL(path, import.meta.url), "utf8");
    for (const statement of sql.split(";").filter((part) => part.trim()))
      await client.$executeRawUnsafe(statement);
  };
  await apply(
    "../prisma/migrations/20261001100000_planning_ideas/migration.sql",
  );
  await client.$executeRawUnsafe(`INSERT INTO "PlanningIdea" (id,title,writing,status,"createdAt","updatedAt") VALUES
    ('old','Old','Old writing','saved','2026-01-01',now()),
    ('new','New','New writing','saved','2026-02-01',now()),
    ('tie-a','Tie A','A','planned','2026-02-01',now()),
    ('tie-z','Tie Z','Z','planned','2026-02-01',now()),
    ('done','Done','D','done',now(),now()),
    ('archived','Archived','Z','archived',now(),now())`);
  await apply(
    "../prisma/migrations/20261006120000_planning_kanban/migration.sql",
  );
  await apply(
    "../prisma/migrations/20261006160000_planning_checklist/migration.sql",
  );
});
test.after(() => client.$disconnect());
const list = () => client.planningIdea.findMany({ orderBy: planningOrder });
const move = (
  id: string,
  status: "saved" | "planned" | "action" | "done" | "archived",
  beforeId: string | null,
) =>
  planningTransaction(
    (tx) => moveInTransaction(tx, id, { status, beforeId }),
    client,
  );

test("migration backfills each old column newest-first and preserves all records", async () => {
  const cards = await list();
  assert.equal(cards.length, 6);
  assert.ok(cards.every((plan) => JSON.stringify(plan.checklist) === "[]"));
  assert.deepEqual(
    cards.filter((p) => p.status === "saved").map((p) => [p.id, p.position]),
    [
      ["new", 0],
      ["old", 1],
    ],
  );
  assert.deepEqual(
    cards.filter((p) => p.status === "planned").map((p) => [p.id, p.position]),
    [
      ["tie-z", 0],
      ["tie-a", 1],
    ],
  );
  assert.equal(cards.find((p) => p.id === "archived")?.status, "archived");
});

test("create, content patch, move, archive and restore persist coherent positions", async () => {
  const p = await createPlan({ title: "Created", writing: "Writing" }, client);
  assert.equal(p.position, 0);
  assert.equal(p.status, "saved");
  assert.deepEqual(
    (await list()).filter((p) => p.status === "saved").map((p) => p.position),
    [0, 1, 2],
  );
  await move(p.id, "planned", "tie-z");
  await move("tie-a", "planned", p.id);
  assert.deepEqual(
    (await list()).filter((p) => p.status === "planned").map((p) => p.id),
    ["tie-a", p.id, "tie-z"],
  );
  await move(p.id, "action", null);
  assert.equal((await list()).find((x) => x.id === p.id)?.position, 0);
  await updatePlan(p.id, { writing: "Edited", status: "archived" }, client);
  await updatePlan(p.id, { status: "saved" }, client);
  const saved = (await list()).filter((p) => p.status === "saved");
  assert.equal(saved.at(-1)?.id, p.id);
  assert.equal(saved.at(-1)?.writing, "Edited");
  assert.deepEqual(
    saved.map((p) => p.position),
    [0, 1, 2],
  );
});

test("stale anchors and aborted transactions leave the board untouched", async () => {
  const before = await list();
  await assert.rejects(move("old", "action", "tie-a"), /anchor/i);
  await assert.rejects(move("missing", "saved", null), /not found/i);
  await assert.rejects(
    planningTransaction(async (tx) => {
      await moveInTransaction(tx, "old", { status: "done", beforeId: null });
      throw new Error("Interrupted");
    }, client),
    /Interrupted/,
  );
  assert.deepEqual(await list(), before);
});

test("concurrent moves and captures serialize without lost plans or duplicate positions", async () => {
  await Promise.all([move("old", "action", null), move("new", "action", null)]);
  await Promise.all([
    createPlan({ title: "Concurrent A", writing: "A" }, client),
    createPlan({ title: "Concurrent B", writing: "B" }, client),
  ]);
  const cards = await list();
  assert.equal(cards.length, 9);
  for (const status of ["saved", "planned", "action", "done", "archived"]) {
    const column = cards.filter((p) => p.status === status);
    assert.deepEqual(
      column.map((p) => p.position),
      column.map((_, i) => i),
    );
  }
  assert.deepEqual(
    new Set(cards.filter((p) => p.status === "action").map((p) => p.id)),
    new Set(["old", "new"]),
  );
});

test("concurrent checklist edits survive moves, text editing and archive restore", async () => {
  assert.equal(typeof store.updateChecklist, "function");
  const plan = await createPlan(
    { title: "Checklist", writing: "Keep my steps" },
    client,
  );
  assert.deepEqual(plan.checklist, []);
  await Promise.all([
    store.updateChecklist(
      plan.id,
      { action: "add", title: "First step" },
      client,
    ),
    store.updateChecklist(
      plan.id,
      { action: "add", title: "Second step" },
      client,
    ),
  ]);
  let saved = await client.planningIdea.findUniqueOrThrow({
    where: { id: plan.id },
  });
  const tasks = saved.checklist as {
    id: string;
    title: string;
    completed: boolean;
  }[];
  assert.deepEqual(
    new Set(tasks.map((t) => t.title)),
    new Set(["First step", "Second step"]),
  );
  await store.updateChecklist(
    plan.id,
    { action: "toggle", id: tasks[0].id, completed: true },
    client,
  );
  await move(plan.id, "action", null);
  await updatePlan(plan.id, { writing: "Edited", status: "archived" }, client);
  await updatePlan(plan.id, { status: "saved" }, client);
  saved = await client.planningIdea.findUniqueOrThrow({
    where: { id: plan.id },
  });
  assert.deepEqual(
    saved.checklist,
    tasks.map((t, i) => ({ ...t, completed: i === 0 })),
  );
  await assert.rejects(
    store.updateChecklist(
      plan.id,
      { action: "toggle", id: "stale", completed: true },
      client,
    ),
    /no longer exists/,
  );
  await assert.rejects(
    store.updateChecklist("missing", { action: "add", title: "Step" }, client),
    /not found/,
  );
  await store.updateChecklist(
    plan.id,
    { action: "remove", id: tasks[0].id },
    client,
  );
  assert.deepEqual(
    (await client.planningIdea.findUniqueOrThrow({ where: { id: plan.id } }))
      .checklist,
    [tasks[1]],
  );
});
