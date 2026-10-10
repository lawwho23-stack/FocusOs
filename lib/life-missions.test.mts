import assert from "node:assert/strict";
import test from "node:test";
import { parseLifeMission, checklistProgress, parseMissionDraft } from "./life-missions";

const draft = {
  title: "  Help people learn  ",
  writing: "  Build useful learning tools.  ",
  icon: "compass",
  checklist: [{ id: "first", title: "  Teach one lesson  ", completed: false }],
};

test("mission input trims text and accepts an empty checklist", () => {
  assert.deepEqual(parseLifeMission(draft), { data: {
    title: "Help people learn", writing: "Build useful learning tools.", icon: "compass",
    checklist: [{ id: "first", title: "Teach one lesson", completed: false }],
  } });
  assert.ok("data" in parseLifeMission({ ...draft, checklist: [] }));
});

test("invalid mission text, icons and checklist entries are rejected", () => {
  for (const value of [null, [], {}, { ...draft, title: " " },
    { ...draft, writing: " " }, { ...draft, icon: "unknown" },
    { ...draft, title: "a".repeat(201) }, { ...draft, writing: "a".repeat(50001) },
    { ...draft, checklist: {} },
    { ...draft, checklist: [{ id: "a", title: " ", completed: false }] },
    { ...draft, checklist: [{ id: "a", title: "Step", completed: 1 }] },
    { ...draft, checklist: [{ id: "a", title: "Step", completed: false }, { id: "a", title: "Duplicate", completed: true }] },
    { ...draft, checklist: Array.from({ length: 101 }, (_, i) => ({ id: String(i), title: "Step", completed: false })) },
  ]) assert.ok("error" in parseLifeMission(value), JSON.stringify(value)?.slice(0, 90));
});

test("progress uses completed steps and never divides by an empty checklist", () => {
  assert.deepEqual(checklistProgress([]), { completed: 0, total: 0, percent: 0 });
  const items = [true, false, true].map((completed, i) => ({ id: String(i), title: "Step", completed }));
  assert.deepEqual(checklistProgress(items), { completed: 2, total: 3, percent: 67 });
});

test("draft recovery preserves unfinished text but rejects corrupt stored data", () => {
  const unfinished = { ...draft, title: "", writing: " unfinished ", checklist: [] };
  assert.deepEqual(parseMissionDraft(JSON.stringify({ version: 1, draft: unfinished })), unfinished);
  for (const raw of [null, "{", JSON.stringify({ version: 2, draft }), JSON.stringify({ version: 1, draft: { ...draft, icon: "unknown" } })]) {
    assert.equal(parseMissionDraft(raw), null);
  }
});

test("draft recovery keeps a temporarily cleared checklist label while save rejects it", () => {
  const editing = { ...draft, checklist: [{ id: "first", title: "", completed: false }] };
  assert.deepEqual(parseMissionDraft(JSON.stringify({ version: 1, draft: editing })), editing);
  assert.ok("error" in parseLifeMission(editing));
});
