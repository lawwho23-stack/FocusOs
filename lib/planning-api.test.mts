import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { GET, POST } from "../app/api/planning-ideas/route";
import { PATCH } from "../app/api/planning-ideas/[id]/route";

const request = (body: unknown) =>
  new Request("http://localhost/api/planning-ideas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const context = { params: Promise.resolve({ id: "missing-idea" }) };

// Prisma delegates are proxies, so Node's method mock cannot replace their
// property descriptors. Replace only the external database boundary.
function databaseFailure(t: TestContext, error: Error) {
  const original = db.planningIdea;
  const transaction = db.$transaction;
  const fail = async () => {
    throw error;
  };
  Object.defineProperty(db, "planningIdea", {
    value: { findMany: fail, create: fail, update: fail },
    configurable: true,
  });
  Object.defineProperty(db, "$transaction", {
    value: fail,
    configurable: true,
  });
  t.after(() => {
    Object.defineProperty(db, "planningIdea", {
      value: original,
      configurable: true,
    });
    Object.defineProperty(db, "$transaction", {
      value: transaction,
      configurable: true,
    });
  });
}

test("invalid capture and patch requests return 400 without requiring a database", async () => {
  for (const body of [
    null,
    [],
    {},
    { writing: " " },
    { writing: "ok", audience: 42 },
  ]) {
    assert.equal((await POST(request(body))).status, 400);
  }
  assert.equal(
    (await PATCH(request({ status: "wrong" }), context)).status,
    400,
  );
  assert.equal((await PATCH(request({}), context)).status, 400);
  assert.equal(
    (
      await POST(
        new Request("http://localhost/api/planning-ideas", {
          method: "POST",
          body: "{",
        }),
      )
    ).status,
    400,
  );
});

test("a missing idea returns 404 rather than a database failure", async (t) => {
  databaseFailure(
    t,
    new Prisma.PrismaClientKnownRequestError("Record missing", {
      code: "P2025",
      clientVersion: "6.19.3",
    }),
  );
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

test("move rejects malformed requests before database access", async () => {
  const { POST: move } =
    await import("../app/api/planning-ideas/[id]/move/route");
  for (const body of [
    { status: "wrong", beforeId: null },
    { status: "saved" },
    { status: "saved", beforeId: 42 },
  ]) {
    assert.equal((await move(request(body), context)).status, 400);
  }
});

test("checklist rejects invalid actions before database access", async () => {
  const { POST: change } =
    await import("../app/api/planning-ideas/[id]/checklist/route");
  for (const input of [
    null,
    { action: "add", title: " " },
    { action: "toggle", id: "a", completed: 1 },
    { action: "remove", id: "" },
  ]) {
    assert.equal((await change(request(input), context)).status, 400);
  }
});

test("checklist database failures keep a retryable error response", async (t) => {
  const { POST: change } =
    await import("../app/api/planning-ideas/[id]/checklist/route");
  databaseFailure(t, new Error("Database unavailable"));
  const response = await change(
    request({ action: "add", title: "Keep this step" }),
    context,
  );
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /try again/i);
});

test("move surfaces stale anchors and missing plans", async (t) => {
  const { POST: move } =
    await import("../app/api/planning-ideas/[id]/move/route");
  const original = db.$transaction;
  const plans = [{ id: "a", status: "saved", position: 0 }];
  Object.defineProperty(db, "$transaction", {
    configurable: true,
    value: async (run: (tx: unknown) => unknown) =>
      run({ planningIdea: { findMany: async () => plans } }),
  });
  t.after(() =>
    Object.defineProperty(db, "$transaction", {
      configurable: true,
      value: original,
    }),
  );
  assert.equal(
    (await move(request({ status: "saved", beforeId: null }), context)).status,
    404,
  );
  assert.equal(
    (
      await move(request({ status: "saved", beforeId: "gone" }), {
        params: Promise.resolve({ id: "a" }),
      })
    ).status,
    409,
  );
});

test("serializable conflicts have bounded retries and a retryable response", async (t) => {
  const { POST: move } =
    await import("../app/api/planning-ideas/[id]/move/route");
  const original = db.$transaction;
  let attempts = 0;
  Object.defineProperty(db, "$transaction", {
    configurable: true,
    value: async (_run: unknown, options: { isolationLevel: string }) => {
      assert.equal(options.isolationLevel, "Serializable");
      attempts++;
      throw new Prisma.PrismaClientKnownRequestError("Conflict", {
        code: "P2034",
        clientVersion: "6.19.3",
      });
    },
  });
  t.after(() =>
    Object.defineProperty(db, "$transaction", {
      configurable: true,
      value: original,
    }),
  );
  const response = await move(
    request({ status: "saved", beforeId: null }),
    context,
  );
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /try again/i);
  assert.equal(attempts, 3);
});
