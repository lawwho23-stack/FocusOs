import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { GET, POST } from "../app/api/planning-ideas/route";
import { PATCH } from "../app/api/planning-ideas/[id]/route";

const request = (body: unknown) => new Request("http://localhost/api/planning-ideas", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const context = { params: Promise.resolve({ id: "missing-idea" }) };

// Prisma delegates are proxies, so Node's method mock cannot replace their
// property descriptors. Replace only the external database boundary.
function databaseFailure(t: TestContext, error: Error) {
  const original = db.planningIdea;
  const fail = async () => { throw error; };
  Object.defineProperty(db, "planningIdea", {
    value: { findMany: fail, create: fail, update: fail }, configurable: true,
  });
  t.after(() => Object.defineProperty(db, "planningIdea", { value: original, configurable: true }));
}

test("invalid capture and patch requests return 400 without requiring a database", async () => {
  for (const body of [null, [], {}, { writing: " " }, { writing: "ok", audience: 42 }]) {
    assert.equal((await POST(request(body))).status, 400);
  }
  assert.equal((await PATCH(request({ status: "wrong" }), context)).status, 400);
  assert.equal((await PATCH(request({}), context)).status, 400);
  assert.equal((await POST(new Request("http://localhost/api/planning-ideas", { method: "POST", body: "{" }))).status, 400);
});

test("a missing idea returns 404 rather than a database failure", async (t) => {
  databaseFailure(t, new Prisma.PrismaClientKnownRequestError("Record missing", { code: "P2025", clientVersion: "6.19.3" }));
  const response = await PATCH(request({ status: "archived" }), context);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, "Idea not found.");
});

test("database outages return 500 and do not masquerade as missing records", async (t) => {
  databaseFailure(t, new Error("Database unavailable"));
  assert.equal((await GET()).status, 500);
  const failedSave = await POST(request({ writing: "Keep this draft" }));
  assert.equal(failedSave.status, 500);
  assert.match((await failedSave.json()).error, /draft/);
  assert.equal((await PATCH(request({ status: "done" }), context)).status, 500);
});
