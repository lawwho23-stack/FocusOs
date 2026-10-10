import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { GET, POST } from "../app/api/life-missions/route";
import { GET as getMission, PATCH, DELETE } from "../app/api/life-missions/[id]/route";

const body = { title: "Learn", writing: "Share what I learn", icon: "book", checklist: [] };
const request = (data: unknown) => new Request("http://localhost/api/life-missions", {
  method: "POST", body: JSON.stringify(data),
});
const context = { params: Promise.resolve({ id: "mission-1" }) };
const timestamp = "2026-10-10T00:00:00.000Z";
function boundary(t: TestContext, methods: Record<string, unknown>) {
  const original = db.lifeMission;
  Object.defineProperty(db, "lifeMission", { value: methods, configurable: true });
  t.after(() => Object.defineProperty(db, "lifeMission", { value: original, configurable: true }));
}
const missing = () => new Prisma.PrismaClientKnownRequestError("Missing", { code: "P2025", clientVersion: "6.19.3" });

test("invalid creates and updates are rejected before touching the database", async (t) => {
  boundary(t, new Proxy({}, { get() { throw new Error("Database must not be touched"); } }));
  for (const input of [null, {}, { ...body, title: " " }, { ...body, icon: "invalid" }]) {
    assert.equal((await POST(request(input))).status, 400);
  }
  assert.equal((await PATCH(request(body), context)).status, 400);
  assert.equal((await PATCH(request({ ...body, expectedUpdatedAt: "invalid" }), context)).status, 400);
});

test("create persists only validated mission fields and returns the saved record", async (t) => {
  boundary(t, { create: async ({ data }: { data: unknown }) => {
    assert.deepEqual(data, body);
    return { ...body, id: "mission-1", createdAt: timestamp, updatedAt: timestamp };
  } });
  const response = await POST(request({ ...body, projectId: "must-not-link", status: "completed" }));
  assert.equal(response.status, 201);
  assert.equal((await response.json()).id, "mission-1");
});

test("updates guard the saved version so an old tab cannot overwrite a newer mission", async (t) => {
  boundary(t, { update: async ({ where, data }: { where: unknown; data: unknown }) => {
    assert.deepEqual(where, { id: "mission-1", updatedAt: new Date(timestamp) });
    assert.deepEqual(data, body);
    return { ...body, id: "mission-1", updatedAt: timestamp };
  } });
  assert.equal((await PATCH(request({ ...body, expectedUpdatedAt: timestamp }), context)).status, 200);
});

test("conflicts preserve retry information while missing missions return 404", async (t) => {
  let exists = true;
  boundary(t, {
    update: async () => { throw missing(); },
    findUnique: async () => exists ? { id: "mission-1" } : null,
    delete: async () => { throw missing(); },
  });
  assert.equal((await PATCH(request({ ...body, expectedUpdatedAt: timestamp }), context)).status, 409);
  exists = false;
  assert.equal((await PATCH(request({ ...body, expectedUpdatedAt: timestamp }), context)).status, 404);
  assert.equal((await DELETE(request(null), context)).status, 404);
});

test("database outages return retryable errors rather than empty success", async (t) => {
  const fail = async () => { throw new Error("Database unavailable"); };
  boundary(t, { findMany: fail, findUnique: fail, create: fail, update: fail, delete: fail });
  assert.equal((await GET()).status, 500);
  assert.equal((await POST(request(body))).status, 500);
  assert.equal((await PATCH(request({ ...body, expectedUpdatedAt: timestamp }), context)).status, 500);
  assert.equal((await DELETE(request(null), context)).status, 500);
  assert.equal((await getMission(request(null), context)).status, 500);
});

test("conflict review loads the current saved mission without changing it", async (t) => {
  const current = { ...body, id: "mission-1", updatedAt: timestamp };
  boundary(t, { findUnique: async ({ where }: { where: unknown }) => {
    assert.deepEqual(where, { id: "mission-1" });
    return current;
  } });
  const response = await getMission(request(null), context);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), current);
});

test("reviewing a deleted mission returns 404 and keeps the draft available", async (t) => {
  boundary(t, { findUnique: async () => null });
  const response = await getMission(request(null), context);
  assert.equal(response.status, 404);
  assert.match((await response.json()).error, /draft/i);
});
