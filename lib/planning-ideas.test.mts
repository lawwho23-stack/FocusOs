import assert from "node:assert/strict";
import test from "node:test";

import * as planning from "./planning-ideas";

test("quick capture creates a title from the first nonblank line", () => {
  assert.equal(
    typeof planning.parsePlanningIdea,
    "function",
    "Planning validation is missing",
  );
  const result = planning.parsePlanningIdea(
    { writing: "\n  A quieter workspace\nMore details" },
    "create",
  );
  assert.ok("data" in result);
  assert.equal(result.data.title, "A quieter workspace");
  assert.equal(result.data.writing, "A quieter workspace\nMore details");
});

test("capture rejects blank writing and non-text inputs", () => {
  assert.equal(
    typeof planning.parsePlanningIdea,
    "function",
    "Planning validation is missing",
  );
  for (const body of [
    null,
    [],
    "idea",
    {},
    { writing: " \n " },
    { writing: 12 },
    { writing: "ok", problem: {} },
  ]) {
    assert.ok("error" in planning.parsePlanningIdea(body, "create"));
  }
});

test("optional answers can be cleared without erasing unrelated fields", () => {
  assert.equal(
    typeof planning.parsePlanningIdea,
    "function",
    "Planning validation is missing",
  );
  assert.deepEqual(planning.parsePlanningIdea({ problem: " " }, "update"), {
    data: { problem: null },
  });
  assert.deepEqual(
    planning.parsePlanningIdea({ status: "archived" }, "update"),
    { data: { status: "archived" } },
  );
  assert.ok(
    "error" in planning.parsePlanningIdea({ status: "active" }, "update"),
  );
  assert.ok("error" in planning.parsePlanningIdea({}, "update"));
});

test("generated titles respect the limit without splitting Unicode characters", () => {
  assert.equal(
    typeof planning.parsePlanningIdea,
    "function",
    "Planning validation is missing",
  );
  const result = planning.parsePlanningIdea(
    { writing: "🌱".repeat(100) },
    "create",
  );
  assert.ok("data" in result);
  assert.equal(result.data.title, "🌱".repeat(80));
});

test("malformed or outdated browser drafts are ignored", () => {
  assert.equal(
    typeof planning.parsePlanningDraft,
    "function",
    "Draft recovery is missing",
  );
  for (const raw of [
    null,
    "{",
    "null",
    '{"version":0}',
    '{"version":1,"draft":{"writing":5}}',
  ]) {
    assert.equal(planning.parsePlanningDraft(raw), null);
  }
});

test("browser draft recovery preserves free writing and optional answers exactly", () => {
  assert.equal(
    typeof planning.parsePlanningDraft,
    "function",
    "Draft recovery is missing",
  );
  const draft = {
    title: "",
    writing: "  My idea\n",
    problem: "",
    audience: "Creators",
    why: "",
    firstStep: "",
    revisitWhen: "After my app",
  };
  assert.deepEqual(
    planning.parsePlanningDraft(JSON.stringify({ version: 1, draft })),
    draft,
  );
});

test("checklist requests reject malformed actions and normalize task writing", () => {
  assert.equal(typeof planning.parseChecklistChange, "function");
  for (const input of [
    null,
    [],
    {},
    { action: "add", title: " " },
    { action: "add", title: "a".repeat(201) },
    { action: "toggle", id: "a" },
    { action: "toggle", id: "a", completed: "yes" },
    { action: "remove", id: "" },
  ]) {
    assert.ok("error" in planning.parseChecklistChange(input));
  }
  assert.deepEqual(
    planning.parseChecklistChange({ action: "add", title: "  First step  " }),
    { data: { action: "add", title: "First step" } },
  );
});

test("checklist changes preserve other tasks and never mutate the saved snapshot", () => {
  assert.equal(typeof planning.applyChecklistChange, "function");
  const original = [{ id: "a", title: "First step", completed: false }];
  const added = planning.applyChecklistChange(
    original,
    { action: "add", title: "Second step" },
    "b",
  );
  assert.deepEqual(added, [
    ...original,
    { id: "b", title: "Second step", completed: false },
  ]);
  const checked = planning.applyChecklistChange(added, {
    action: "toggle",
    id: "a",
    completed: true,
  });
  assert.deepEqual(checked, [
    { id: "a", title: "First step", completed: true },
    added[1],
  ]);
  assert.deepEqual(original, [
    { id: "a", title: "First step", completed: false },
  ]);
  assert.deepEqual(
    planning.applyChecklistChange(checked, {
      action: "toggle",
      id: "a",
      completed: true,
    }),
    checked,
  );
  assert.deepEqual(
    planning.applyChecklistChange(checked, { action: "remove", id: "a" }),
    [added[1]],
  );
});

test("stale checklist changes and excessive task lists fail without erasing tasks", () => {
  assert.equal(typeof planning.applyChecklistChange, "function");
  assert.throws(
    () =>
      planning.applyChecklistChange([], {
        action: "toggle",
        id: "gone",
        completed: true,
      }),
    /no longer exists/i,
  );
  const full = Array.from({ length: 100 }, (_, i) => ({
    id: String(i),
    title: "Step",
    completed: false,
  }));
  assert.throws(
    () =>
      planning.applyChecklistChange(
        full,
        { action: "add", title: "Overflow" },
        "new",
      ),
    /100/,
  );
  assert.equal(full.length, 100);
});
