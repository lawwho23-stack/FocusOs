import assert from "node:assert/strict";
import { applyChecklistChange } from "../lib/planning-ideas.ts";
import { arrangePlans } from "../lib/planning-order.ts";
const { chromium } = await import(
  process.env.PLANNING_PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.PLANNING_PREVIEW_URL || "http://127.0.0.1:3010";
if (base !== "http://127.0.0.1:3010")
  throw new Error("Browser tests require the isolated fixture gateway.");
const browser = await chromium.launch({ channel: "chrome", headless: true });
let passed = 0;
const seed = () =>
  [
    [
      "a",
      "Design a calmer morning",
      "One focus session before opening social media.",
      "saved",
      0,
    ],
    [
      "b",
      "Build the next lesson",
      "Write a small lesson and try it with a learner.",
      "saved",
      1,
    ],
    [
      "c",
      "Ship the FocusOS board",
      "Use small steps, then verify the result.",
      "planned",
      0,
    ],
    [
      "d",
      "Finish the prototype",
      "A working prototype ready to learn from.",
      "done",
      0,
    ],
    [
      "z",
      "A future experiment",
      "Keep this for another season.",
      "archived",
      0,
    ],
  ].map(([id, title, writing, status, position]) => ({
    id,
    title,
    writing,
    status,
    position,
    checklist: [],
    problem: null,
    audience: null,
    why: null,
    firstStep: null,
    revisitWhen: null,
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
  }));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function scenario(name, options, run) {
  if (
    process.env.PLANNING_BROWSER_SCENARIO &&
    !name.includes(process.env.PLANNING_BROWSER_SCENARIO)
  )
    return;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    ...options,
  });
  const page = await context.newPage();
  const state = {
    plans: seed(),
    moves: 0,
    saves: 0,
    failMove: false,
    failSave: false,
    slowSave: false,
    errors: [],
  };
  page.on("pageerror", (error) => state.errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    let data = [];
    let status = 200;
    if (path.startsWith("/api/planning-ideas")) {
      if (req.method() === "GET") data = state.plans;
      else {
        const input = req.postDataJSON();
        const id = path.split("/")[3];
        if (path.endsWith("/move")) {
          state.moves++;
          if (state.failMove) {
            state.failMove = false;
            status = 503;
            data = { error: "Test move failed. Please try again." };
          } else {
            state.plans = arrangePlans(
              state.plans,
              id,
              input.status,
              input.beforeId,
            );
            data = state.plans;
          }
        } else {
          state.saves++;
          if (state.slowSave) {
            state.slowSave = false;
            await sleep(500);
          }
          if (state.failSave) {
            state.failSave = false;
            status = 503;
            data = { error: "Test save failed. Your draft is still here." };
          } else if (req.method() === "POST" && !path.endsWith("/checklist")) {
            data = {
              ...seed()[0],
              ...input,
              id: "created-" + state.saves,
              title: input.title?.trim() || input.writing.trim().split("\n")[0],
              status: "saved",
              position: 0,
            };
            state.plans = [
              data,
              ...state.plans.map((p) =>
                p.status === "saved" ? { ...p, position: p.position + 1 } : p,
              ),
            ];
          } else if (path.endsWith("/checklist")) {
            const plan = state.plans.find((p) => p.id === id);
            data = {
              ...plan,
              checklist: applyChecklistChange(
                plan.checklist,
                input,
                "task-" + state.saves,
              ),
            };
            state.plans = state.plans.map((p) => (p.id === id ? data : p));
          } else {
            data = { ...state.plans.find((p) => p.id === id), ...input };
            state.plans = state.plans.map((p) => (p.id === id ? data : p));
          }
        }
      }
    } else if (path === "/api/ai/coach/chat") data = { messages: [] };
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  try {
    await page.goto(base + "/planning");
    await page
      .getByRole("button", { name: "Add plan", exact: true })
      .waitFor({ state: "visible" });
    await page.waitForFunction(
      () =>
        !!document.querySelector('[data-plan-id="a"] button[aria-describedby]'),
    );
    await run(page, state, context);
    assert.deepEqual(state.errors, [], "fresh browser has no client errors");
    passed++;
    console.log("PASS " + name);
  } catch (error) {
    console.error(await page.locator("main").innerText());
    console.error(state);
    await page.screenshot({
      path: "/private/tmp/focusos-kanban-browser-failure.png",
      fullPage: true,
    });
    throw error;
  } finally {
    await context.close();
  }
}
const ids = (page, status) =>
  page
    .locator(`[data-column="${status}"] [data-plan-id]`)
    .evaluateAll((elements) =>
      elements
        .filter((e) => !e.closest("[aria-hidden=true]"))
        .map((e) => e.dataset.planId),
    );
const stable = (page) =>
  page.waitForFunction(
    () =>
      !document.querySelector('[aria-busy="true"]') &&
      !document.querySelector(
        'button[aria-pressed="true"][aria-label^="Drag "]',
      ) &&
      !document.querySelector("[data-dnd-placeholder]"),
  );
async function mouseDrag(page, handle, target) {
  const start = await handle.boundingBox();
  const end = await target.boundingBox();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    start.x + start.width / 2 + 8,
    start.y + start.height / 2,
    { steps: 3 },
  );
  await sleep(60);
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, {
    steps: 14,
  });
  await sleep(200);
  await page.mouse.up();
  await stable(page);
  await sleep(200);
}
try {
  await scenario(
    "card checklists save, survive reload, retry failures and allow background dragging",
    {},
    async (page, state) => {
      const card = () => page.locator('[data-plan-id="a"]');
      await card()
        .getByRole("textbox", { name: "New task" })
        .fill("Outline the next lesson");
      await card()
        .getByRole("button", { name: "Add task", exact: true })
        .click();
      await card()
        .getByRole("checkbox", { name: "Outline the next lesson", exact: true })
        .waitFor({ state: "visible", timeout: 5000 });
      assert.equal(await page.getByRole("dialog").count(), 0);
      await card()
        .getByRole("checkbox", { name: "Outline the next lesson", exact: true })
        .check();
      await stable(page);
      await page.reload();
      await card()
        .getByRole("checkbox", { name: "Outline the next lesson", exact: true })
        .waitFor({ state: "visible" });
      assert.equal(
        await card()
          .getByRole("checkbox", {
            name: "Outline the next lesson",
            exact: true,
          })
          .isChecked(),
        true,
      );
      state.failSave = true;
      await card()
        .getByRole("checkbox", { name: "Outline the next lesson", exact: true })
        .uncheck();
      await card()
        .getByRole("button", { name: "Retry task save" })
        .waitFor({ state: "visible" });
      assert.equal(
        await card()
          .getByRole("checkbox", {
            name: "Outline the next lesson",
            exact: true,
          })
          .isChecked(),
        true,
      );
      await card().getByRole("button", { name: "Retry task save" }).click();
      await stable(page);
      assert.equal(
        await card()
          .getByRole("checkbox", {
            name: "Outline the next lesson",
            exact: true,
          })
          .isChecked(),
        false,
      );
      assert.equal(
        state.moves,
        0,
        "checklist interactions do not drag the card",
      );
      await mouseDrag(
        page,
        card().locator("p").first(),
        page.locator('[data-column="action"]'),
      );
      assert.deepEqual(await ids(page, "action"), ["a"]);
      assert.equal(
        await page.getByRole("dialog").count(),
        0,
        "a drag does not open the editor",
      );
      await card()
        .getByRole("button", {
          name: "Remove Outline the next lesson",
          exact: true,
        })
        .click();
      await stable(page);
      assert.equal(await card().getByRole("checkbox").count(), 0);
      await page.reload();
      await card().waitFor({ state: "visible" });
      assert.equal(await card().getByRole("checkbox").count(), 0);
    },
  );
  await scenario(
    "desktop layout, keyboard cross-column and same-column drag, cancel, persistence",
    {},
    async (page, state) => {
      const positions = await page.locator("[data-column]").evaluateAll((el) =>
        el.map((e) => ({
          x: e.getBoundingClientRect().x,
          y: e.getBoundingClientRect().y,
        })),
      );
      assert.equal(new Set(positions.map((p) => p.y)).size, 1);
      assert.equal(new Set(positions.map((p) => p.x)).size, 4);
      await page
        .getByRole("button", {
          name: "Drag Design a calmer morning",
          exact: true,
        })
        .press("Space");
      await page.waitForFunction(
        () =>
          !!document.querySelector(
            'button[aria-label^="Drag " ][aria-pressed="true"]',
          ),
      );
      await page.keyboard.press("ArrowRight");
      await sleep(150);
      await page.keyboard.press("Space");
      await stable(page);
      assert.deepEqual(await ids(page, "planned"), ["a", "c"]);
      assert.equal(state.moves, 1);
      await page
        .getByRole("button", {
          name: "Drag Design a calmer morning",
          exact: true,
        })
        .press("Space");
      await page.waitForFunction(
        () =>
          !!document.querySelector(
            'button[aria-label^="Drag " ][aria-pressed="true"]',
          ),
      );
      await page.keyboard.press("ArrowDown");
      await sleep(150);
      await page.keyboard.press("Space");
      await stable(page);
      assert.deepEqual(await ids(page, "planned"), ["c", "a"]);
      assert.equal(state.moves, 2);
      await page
        .getByRole("button", {
          name: "Drag Design a calmer morning",
          exact: true,
        })
        .press("Space");
      await page.waitForFunction(
        () =>
          !!document.querySelector(
            'button[aria-label^="Drag " ][aria-pressed="true"]',
          ),
      );
      await page.keyboard.press("ArrowRight");
      await sleep(150);
      await page.keyboard.press("Escape");
      await stable(page);
      assert.deepEqual(await ids(page, "planned"), ["c", "a"]);
      assert.deepEqual(await ids(page, "action"), []);
      assert.equal(state.moves, 2);
      await page.reload();
      await page.waitForFunction(
        () => !!document.querySelector('[data-plan-id="a"]'),
      );
      assert.deepEqual(await ids(page, "planned"), ["c", "a"]);
    },
  );
  await scenario(
    "mouse handle dragging to empty column, canceled drag and move rollback/retry",
    {},
    async (page, state) => {
      await mouseDrag(
        page,
        page.getByRole("button", {
          name: "Drag Design a calmer morning",
          exact: true,
        }),
        page.locator('[data-column="action"]'),
      );
      assert.deepEqual(await ids(page, "action"), ["a"]);
      assert.equal(state.moves, 1);
      state.failMove = true;
      await mouseDrag(
        page,
        page.getByRole("button", {
          name: "Drag Design a calmer morning",
          exact: true,
        }),
        page.locator('[data-column="done"]').getByText("Drop a plan here", { exact: true }),
      );
      await page
        .getByRole("button", { name: "Retry move" })
        .waitFor({ state: "visible" });
      assert.deepEqual(await ids(page, "action"), ["a"]);
      await page.getByRole("button", { name: "Retry move" }).click();
      await stable(page);
      assert.deepEqual(await ids(page, "done"), ["d", "a"]);
      const start = await page
        .getByRole("button", {
          name: "Drag Build the next lesson",
          exact: true,
        })
        .boundingBox();
      const end = await page.locator('[data-column="planned"]').boundingBox();
      const count = state.moves;
      await page.mouse.move(start.x + 12, start.y + 12);
      await page.mouse.down();
      await page.mouse.move(end.x + 40, end.y + 80, { steps: 15 });
      await sleep(180);
      await page.keyboard.press("Escape");
      await page.mouse.up();
      await stable(page);
      assert.deepEqual(await ids(page, "saved"), ["b"]);
      assert.equal(state.moves, count);
    },
  );
  await scenario(
    "create/edit draft recovery, failed save, close during save, title generation and archive/restore",
    {},
    async (page, state) => {
      await page.getByRole("button", { name: "Add plan", exact: true }).click();
      assert.equal(
        await page
          .getByRole("textbox", { name: "Write your idea", exact: true })
          .inputValue(),
        "",
      );
      await page
        .getByRole("textbox", { name: "Write your idea", exact: true })
        .fill("A new direction\nKeep the next step small.");
      await page.keyboard.press("Escape");
      await page.reload();
      await page
        .getByRole("button", { name: "Resume draft", exact: true })
        .waitFor({ state: "visible" });
      await page
        .getByRole("button", { name: "Resume draft", exact: true })
        .click();
      assert.match(
        await page
          .getByRole("textbox", { name: "Write your idea", exact: true })
          .inputValue(),
        /A new direction/,
      );
      state.failSave = true;
      await page
        .getByRole("button", { name: "Save plan", exact: true })
        .click();
      await page
        .getByText("Test save failed. Your draft is still here.")
        .waitFor({ state: "visible" });
      assert.equal(await page.getByRole("dialog").count(), 1);
      state.slowSave = true;
      await page
        .getByRole("button", { name: "Save plan", exact: true })
        .click();
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("dialog").count(), 1);
      assert.equal(
        await page
          .getByRole("button", { name: "Close plan editor" })
          .isDisabled(),
        true,
      );
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.equal(
        state.plans.filter((p) => p.title === "A new direction").length,
        1,
      );
      assert.equal((await ids(page, "saved"))[0], "created-2");
      assert.equal(
        await page.evaluate(() =>
          localStorage.getItem("focusos:planning-draft:new"),
        ),
        null,
      );
      await page
        .getByRole("button", { name: "A new direction", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "Write your idea", exact: true })
        .fill("Edited writing that needs recovery");
      await page.keyboard.press("Escape");
      await page.reload();
      await page
        .locator('[data-plan-id="created-2"]')
        .getByRole("button", { name: "Resume draft" })
        .click();
      assert.equal(
        await page
          .getByRole("textbox", { name: "Write your idea", exact: true })
          .inputValue(),
        "Edited writing that needs recovery",
      );
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page
        .locator('[data-plan-id="created-2"]')
        .getByRole("button", { name: "Archive A new direction", exact: true })
        .click();
      await stable(page);
      await page.getByRole("button", { name: /^Archived / }).click();
      await page
        .getByRole("article")
        .filter({
          has: page.getByRole("button", {
            name: "A new direction",
            exact: true,
          }),
        })
        .getByRole("button", { name: "Restore", exact: true })
        .click();
      await stable(page);
      await page.getByRole("button", { name: "Board", exact: true }).click();
      assert.equal((await ids(page, "saved")).at(-1), "created-2");
    },
  );
  await scenario("card opening and keyboard focus trap", {}, async (page) => {
    await page.locator('[data-plan-id="a"] p').click();
    await page.getByRole("dialog").waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Add plan", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Write your idea", exact: true })
      .waitFor({ state: "visible" });
    for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
    await page.waitForFunction(
      () => !!document.activeElement?.closest('[role="dialog"]'),
    );
    assert.equal(
      await page.evaluate(
        () => !!document.activeElement?.closest('[role="dialog"]'),
      ),
      true,
    );
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.waitForFunction(() =>
      document.activeElement?.textContent?.includes("Add plan"),
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Add plan", exact: true })
        .evaluate((e) => e === document.activeElement),
      true,
    );
  });
  await scenario(
    "storage failure blocks Escape and Close without losing unsaved writing",
    {},
    async (page) => {
      await page.evaluate(() => {
        Storage.prototype.setItem = function () {
          throw new Error("Test storage failed");
        };
      });
      await page.getByRole("button", { name: "Add plan", exact: true }).click();
      await page
        .getByRole("textbox", { name: "Write your idea", exact: true })
        .fill("This writing must not disappear");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Close plan editor" }).click();
      assert.equal(await page.getByRole("dialog").count(), 1);
      assert.equal(
        await page
          .getByRole("textbox", { name: "Write your idea", exact: true })
          .inputValue(),
        "This writing must not disappear",
      );
      assert.match(
        await page.getByRole("dialog").innerText(),
        /Save or explicitly discard/,
      );
      await page
        .getByRole("button", { name: "Save plan", exact: true })
        .click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
    },
  );
  await scenario(
    "failed draft cleanup stays visible after an acknowledged save",
    {},
    async (page, state) => {
      await page.getByRole("button", { name: "Add plan", exact: true }).click();
      await page
        .getByRole("textbox", { name: "Write your idea", exact: true })
        .fill("Already saved writing");
      await page.evaluate(() => {
        Storage.prototype.removeItem = function () {
          throw new Error("Test cleanup failed");
        };
      });
      await page
        .getByRole("button", { name: "Save plan", exact: true })
        .click();
      await page
        .locator('[data-plan-id="created-1"]')
        .waitFor({ state: "attached" });
      assert.equal(state.saves, 1);
      await page
        .getByText(
          "Could not clear the browser draft. An old draft may reappear after refresh.",
        )
        .waitFor({ state: "visible", timeout: 3000 });
      assert.equal(
        await page
          .getByRole("button", { name: "Save plan", exact: true })
          .isDisabled(),
        true,
      );
    },
  );
  await scenario(
    "mobile full-screen drawer, horizontal board, touch drag and scroll",
    { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    async (page, state, context) => {
      const layout = await page
        .locator('[aria-label="Planning board"]')
        .evaluate((el) => ({
          scroll: el.scrollWidth,
          width: el.clientWidth,
          document: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
        }));
      assert.ok(layout.scroll > layout.width);
      assert.equal(layout.document, layout.viewport);
      await page.getByRole("button", { name: "Add plan", exact: true }).tap();
      const dialog = await page.getByRole("dialog").boundingBox();
      assert.equal(dialog.x, 0);
      assert.equal(dialog.width, 390);
      assert.equal(dialog.height, 844);
      await page.getByRole("button", { name: "Close plan editor" }).tap();
      const session = await context.newCDPSession(page);
      const card = page.locator('[data-plan-id="a"]');
      await card.getByRole("textbox", { name: "New task" }).fill("Mobile step");
      await card.getByRole("button", { name: "Add task", exact: true }).tap();
      await card
        .getByRole("checkbox", { name: "Mobile step", exact: true })
        .waitFor({ state: "visible" });
      await stable(page);
      await card
        .getByRole("checkbox", { name: "Mobile step", exact: true })
        .tap();
      await stable(page);
      assert.equal(
        await card
          .getByRole("checkbox", { name: "Mobile step", exact: true })
          .isChecked(),
        true,
      );
      assert.equal(state.moves, 0);
      assert.equal(await page.getByRole("dialog").count(), 0);
      const handle = await card.locator("p").first().boundingBox();
      const point = {
        x: handle.x + handle.width / 2,
        y: handle.y + handle.height / 2,
      };
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [point],
      });
      await sleep(260);
      const target = await page.locator('[data-plan-id="b"]').boundingBox();
      for (let i = 1; i <= 8; i++) {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            {
              x: point.x,
              y: point.y + ((target.y + target.height * 0.8 - point.y) * i) / 8,
            },
          ],
        });
        await sleep(30);
      }
      await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await stable(page);
      assert.deepEqual(await ids(page, "saved"), ["b", "a"]);
      assert.equal(state.moves, 1);
      const board = await page
        .locator('[aria-label="Planning board"]')
        .boundingBox();
      const scrollY = board.y + 20;
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: 320, y: scrollY }],
      });
      for (let i = 1; i <= 10; i++) {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: 320 - 24 * i, y: scrollY }],
        });
        await sleep(30);
      }
      await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await sleep(150);
      assert.ok(
        (await page
          .locator('[aria-label="Planning board"]')
          .evaluate((el) => el.scrollLeft)) > 0,
        "scrolling on the column background stays available",
      );
      assert.equal(state.moves, 1);
    },
  );
  await scenario(
    "automatic horizontal board scrolling during a narrow-screen drag",
    { viewport: { width: 390, height: 844 } },
    async (page, state) => {
      const handle = await page
        .getByRole("button", {
          name: "Drag Design a calmer morning",
          exact: true,
        })
        .boundingBox();
      const board = await page
        .locator('[aria-label="Planning board"]')
        .boundingBox();
      await page.mouse.move(
        handle.x + handle.width / 2,
        handle.y + handle.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        board.x + board.width - 8,
        handle.y + handle.height / 2,
        { steps: 10 },
      );
      await page.waitForFunction(
        () =>
          document.querySelector('[aria-label="Planning board"]').scrollLeft >
          50,
        {},
        { timeout: 5000 },
      );
      await page.keyboard.press("Escape");
      await page.mouse.up();
      await stable(page);
      assert.equal(state.moves, 0);
    },
  );
  await scenario(
    "reduced-motion disables transitions and still allows keyboard dragging",
    { reducedMotion: "reduce" },
    async (page, state) => {
      assert.equal(
        await page.evaluate(
          () => matchMedia("(prefers-reduced-motion: reduce)").matches,
        ),
        true,
      );
      assert.equal(
        await page
          .locator('[data-plan-id="a"]')
          .evaluate((el) => getComputedStyle(el).transitionDuration),
        "0s",
      );
      await page
        .getByRole("button", {
          name: "Drag Design a calmer morning",
          exact: true,
        })
        .press("Space");
      await page.waitForFunction(
        () =>
          !!document.querySelector(
            'button[aria-label^="Drag " ][aria-pressed="true"]',
          ),
      );
      await page.keyboard.press("ArrowRight");
      await sleep(100);
      await page.keyboard.press("Space");
      await stable(page);
      assert.deepEqual(await ids(page, "planned"), ["a", "c"]);
      assert.equal(state.moves, 1);
    },
  );
  console.log(`${passed} browser scenarios passed.`);
} finally {
  await browser.close();
}
