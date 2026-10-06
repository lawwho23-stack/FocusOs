import assert from "node:assert/strict";
import test from "node:test";
import * as order from "./planning-order";
import * as planning from "./planning-ideas";

test("move validation requires a known status and an explicit nullable anchor", () => {
  assert.equal(typeof order.parsePlanningMove, "function");
  for (const body of [
    null,
    [],
    {},
    { status: "active", beforeId: null },
    { status: "saved" },
    { status: "saved", beforeId: 42 },
    { status: "saved", beforeId: "" },
  ]) {
    assert.ok("error" in order.parsePlanningMove(body));
  }
  assert.deepEqual(
    order.parsePlanningMove({ status: "action", beforeId: null }),
    { data: { status: "action", beforeId: null } },
  );
});

test("moving before an anchor preserves other card order and updates dense positions", () => {
  assert.equal(typeof order.arrangePlans, "function");
  const cards = [
    { id: "a", status: "saved", position: 0 },
    { id: "b", status: "saved", position: 1 },
    { id: "c", status: "planned", position: 0 },
  ];
  const result = order.arrangePlans(cards, "b", "planned", "c");
  assert.deepEqual(
    result.filter((x) => x.status === "saved").map((x) => [x.id, x.position]),
    [["a", 0]],
  );
  assert.deepEqual(
    result.filter((x) => x.status === "planned").map((x) => [x.id, x.position]),
    [
      ["b", 0],
      ["c", 1],
    ],
  );
  assert.equal(
    cards[1].status,
    "saved",
    "preview does not mutate the drag snapshot",
  );
});

test("same-column reorder, empty destination, and bottom restore are supported", () => {
  assert.equal(typeof order.arrangePlans, "function");
  const cards = [
    { id: "a", status: "saved", position: 0 },
    { id: "b", status: "saved", position: 1 },
    { id: "z", status: "archived", position: 0 },
  ];
  assert.deepEqual(
    order
      .arrangePlans(cards, "a", "saved", null)
      .filter((x) => x.status === "saved")
      .map((x) => x.id),
    ["b", "a"],
  );
  assert.deepEqual(
    order
      .arrangePlans(cards, "z", "saved", null)
      .filter((x) => x.status === "saved")
      .map((x) => x.id),
    ["a", "b", "z"],
  );
  assert.equal(
    order.arrangePlans(cards, "a", "action", null).find((x) => x.id === "a")
      ?.position,
    0,
  );
});

test("missing plans and stale, wrong-column or self anchors cannot move cards", () => {
  assert.equal(typeof order.arrangePlans, "function");
  const cards = [
    { id: "a", status: "saved", position: 0 },
    { id: "b", status: "planned", position: 0 },
  ];
  assert.throws(
    () => order.arrangePlans(cards, "missing", "saved", null),
    /not found/i,
  );
  for (const anchor of ["gone", "b", "a"])
    assert.throws(
      () => order.arrangePlans(cards, "a", "saved", anchor),
      /anchor/i,
    );
});

test("Action is editable while positions remain server controlled", () => {
  assert.ok(planning.PLANNING_STATUSES.includes("action"));
  assert.deepEqual(
    planning.parsePlanningIdea({ status: "action", position: -100 }, "update"),
    { data: { status: "action" } },
  );
});
