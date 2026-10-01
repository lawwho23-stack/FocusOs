import assert from "node:assert/strict";
import test from "node:test";

import * as planning from "./planning-ideas";

test("quick capture creates a title from the first nonblank line", () => {
  assert.equal(typeof planning.parsePlanningIdea, "function", "Planning validation is missing");
  const result = planning.parsePlanningIdea({ writing: "\n  A quieter workspace\nMore details" }, "create");
  assert.ok("data" in result);
  assert.equal(result.data.title, "A quieter workspace");
  assert.equal(result.data.writing, "A quieter workspace\nMore details");
});

test("capture rejects blank writing and non-text inputs", () => {
  assert.equal(typeof planning.parsePlanningIdea, "function", "Planning validation is missing");
  for (const body of [null, [], "idea", {}, { writing: " \n " }, { writing: 12 }, { writing: "ok", problem: {} }]) {
    assert.ok("error" in planning.parsePlanningIdea(body, "create"));
  }
});

test("optional answers can be cleared without erasing unrelated fields", () => {
  assert.equal(typeof planning.parsePlanningIdea, "function", "Planning validation is missing");
  assert.deepEqual(planning.parsePlanningIdea({ problem: " " }, "update"), { data: { problem: null } });
  assert.deepEqual(planning.parsePlanningIdea({ status: "archived" }, "update"), { data: { status: "archived" } });
  assert.ok("error" in planning.parsePlanningIdea({ status: "active" }, "update"));
  assert.ok("error" in planning.parsePlanningIdea({}, "update"));
});

test("generated titles respect the limit without splitting Unicode characters", () => {
  assert.equal(typeof planning.parsePlanningIdea, "function", "Planning validation is missing");
  const result = planning.parsePlanningIdea({ writing: "🌱".repeat(100) }, "create");
  assert.ok("data" in result);
  assert.equal(result.data.title, "🌱".repeat(80));
});

test("malformed or outdated browser drafts are ignored", () => {
  assert.equal(typeof planning.parsePlanningDraft, "function", "Draft recovery is missing");
  for (const raw of [null, "{", "null", '{"version":0}', '{"version":1,"draft":{"writing":5}}']) {
    assert.equal(planning.parsePlanningDraft(raw), null);
  }
});

test("browser draft recovery preserves free writing and optional answers exactly", () => {
  assert.equal(typeof planning.parsePlanningDraft, "function", "Draft recovery is missing");
  const draft = { title: "", writing: "  My idea\n", problem: "", audience: "Creators", why: "", firstStep: "", revisitWhen: "After my app" };
  assert.deepEqual(planning.parsePlanningDraft(JSON.stringify({ version: 1, draft })), draft);
});
