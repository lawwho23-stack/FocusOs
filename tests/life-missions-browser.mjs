import assert from "node:assert/strict";

const { chromium } = await import(process.env.LIFE_MISSIONS_PLAYWRIGHT_MODULE || "playwright");
const base = "http://127.0.0.1:3047";
const browser = await chromium.launch({ channel: "chrome", headless: true });
let passed = 0;

async function scenario(name, options, run) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const state = {
    missions: [{ id: "mission-1", title: "Help others learn", writing: "Make learning accessible through useful tools.", icon: "compass", checklist: [], createdAt: "2026-10-10T00:00:00.000Z", updatedAt: "2026-10-10T00:00:00.000Z" }],
    failNext: false, failLoad: false, saves: 0,
  };
  // Every API request is intercepted; the browser suite cannot write to a database.
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    let status = 200, result = [];
    if (path.startsWith("/api/life-missions")) {
      if (method === "GET") {
        if (state.failLoad) { status = 503; result = { error: "Could not load missions. Please try again." }; }
        else result = path === "/api/life-missions" ? state.missions : state.missions.find((mission) => mission.id === path.split("/").at(-1));
      } else if (state.failNext) {
        state.failNext = false; status = 503; result = { error: "Fixture save failure. Your draft is still here; please try again." };
      } else {
        const id = path.split("/").at(-1);
        const data = method === "DELETE" ? null : request.postDataJSON();
        if (method === "POST") {
          state.saves++;
          const draft = { ...data };
          delete draft.expectedUpdatedAt;
          result = { ...draft, id: `new-${state.saves}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
          state.missions.unshift(result); status = 201;
        } else if (method === "PATCH") {
          const existing = state.missions.find((mission) => mission.id === id);
          if (existing.updatedAt !== data.expectedUpdatedAt) { status = 409; result = { error: "This mission changed in another tab. Your draft is kept." }; }
          else {
            state.saves++;
            const draft = { ...data };
          delete draft.expectedUpdatedAt;
            result = { ...existing, ...draft, updatedAt: new Date().toISOString() };
            state.missions = state.missions.map((mission) => mission.id === id ? result : mission);
          }
        } else {
          state.missions = state.missions.filter((mission) => mission.id !== id);
          result = { deleted: true };
        }
      }
    } else if (path === "/api/day") {
      result = { date: new URL(request.url()).searchParams.get("date"), mission: null, sessions: [], reflection: null, note: null, stats: { tasksDone: 0, tasksTotal: 0, taskPct: null, focusMinutes: 0, sessionsCompleted: 0, sessionsInterrupted: 0, plannedMinutes: 0, energy: null, minutesLost: null } };
    } else if (path.startsWith("/api/ai/coach")) {
      result = path.endsWith("/health") ? { ok: true } : { messages: [] };
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(result) });
  });
  try {
    await page.goto(`${base}/missions`);
    await page.getByLabel("Mission title", { exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector("fieldset[disabled]"));
    await run(page, state);
    assert.deepEqual(errors, [], "No browser exceptions");
    passed++;
    console.log(`PASS ${name}`);
  } finally { await context.close(); }
}

const cardFor = (page, title) => page.locator("form").filter({ has: page.locator(`input[value="${title}"]`) });
const saved = async (page) => { await page.getByText("Mission saved.", { exact: true }).waitFor(); await page.waitForFunction(() => !document.querySelector("fieldset[disabled]")); };

try {
  await scenario("create, edit, icons, checklist progress, persistence and delete", {}, async (page, state) => {
    const nav = page.locator("aside");
    assert.deepEqual(await nav.getByRole("link").allTextContents(), ["My day", "Goals", "Missions", "Planning", "Notes", "Reflection", "Progress"]);
    assert.match(await nav.getByRole("link", { name: "Missions", exact: true }).getAttribute("class"), /text-primary/);
    await page.getByRole("button", { name: "Add mission", exact: true }).click();
    const newCard = page.locator("form").first();
    await newCard.getByLabel("Mission title", { exact: true }).fill("Build useful things");
    await newCard.getByLabel("My mission", { exact: true }).fill("Build products that help people live better.");
    await newCard.getByRole("button", { name: "Choose mission icon" }).click();
    await newCard.getByRole("button", { name: "Rocket icon" }).click();
    await newCard.getByLabel("New step", { exact: true }).fill("Ship one product");
    await newCard.getByRole("button", { name: "Add step", exact: true }).click();
    await newCard.getByLabel("New step", { exact: true }).fill("Talk to users");
    await newCard.getByLabel("New step", { exact: true }).press("Enter");
    await newCard.getByRole("checkbox", { name: "Complete Ship one product" }).check();
    assert.equal(await newCard.getByRole("progressbar").getAttribute("aria-valuenow"), "50");
    await newCard.getByRole("button", { name: "Save mission", exact: true }).click();
    await saved(page);
    assert.equal(state.missions[0].icon, "rocket");
    await page.reload();
    const card = cardFor(page, "Build useful things");
    await card.getByLabel("Step 2", { exact: true }).fill("Listen to five users");
    await card.getByRole("button", { name: "Remove step 1", exact: true }).click();
    await card.getByRole("button", { name: "Save changes", exact: true }).click();
    await saved(page);
    assert.deepEqual(state.missions[0].checklist.map((step) => step.title), ["Listen to five users"]);
    page.once("dialog", (dialog) => dialog.dismiss());
    await card.getByRole("button", { name: "Delete Build useful things" }).click();
    assert.equal(state.missions.length, 2);
    page.once("dialog", (dialog) => dialog.accept());
    await card.getByRole("button", { name: "Delete Build useful things" }).click();
    await page.getByText("Mission deleted.", { exact: true }).waitFor();
    assert.equal(state.missions.length, 1);
  });

  await scenario("new drafts recover after reload and survive failed saves", {}, async (page, state) => {
    await page.getByRole("button", { name: "Add mission", exact: true }).click();
    const card = page.locator("form").first();
    await card.getByLabel("Mission title", { exact: true }).fill("A recovered mission");
    await card.getByLabel("My mission", { exact: true }).fill("Writing that must survive.");
    await page.reload();
    await page.waitForFunction(() => document.querySelector('input[id="mission-new-title"]')?.value === "A recovered mission");
    assert.equal(await card.getByLabel("My mission", { exact: true }).inputValue(), "Writing that must survive.");
    state.failNext = true;
    await card.getByRole("button", { name: "Save mission", exact: true }).click();
    await card.getByRole("alert").waitFor();
    assert.equal(await card.getByLabel("My mission", { exact: true }).inputValue(), "Writing that must survive.");
    await card.getByRole("button", { name: "Save mission", exact: true }).click();
    await saved(page);
    assert.equal(state.saves, 1);
    assert.equal(await page.evaluate(() => sessionStorage.getItem("focusos:life-mission-draft:new")), null);
  });

  await scenario("editing drafts keep blank steps and reject stale versions after reload", {}, async (page, state) => {
    const card = page.locator("form").first();
    await card.getByLabel("New step", { exact: true }).fill("A draft step");
    await card.getByRole("button", { name: "Add step", exact: true }).click();
    await card.getByLabel("Step 1", { exact: true }).fill("");
    state.missions[0].updatedAt = "2026-10-11T00:00:00.000Z";
    await page.reload();
    await card.getByLabel("Step 1", { exact: true }).waitFor();
    assert.equal(await card.getByLabel("Step 1", { exact: true }).inputValue(), "");
    await card.getByLabel("Step 1", { exact: true }).fill("Recovered step");
    await card.getByRole("button", { name: "Save changes", exact: true }).click();
    await card.getByRole("alert").waitFor();
    assert.match(await card.getByRole("alert").innerText(), /another tab/);
    assert.equal(state.saves, 0);
    await card.getByRole("button", { name: "Review saved version" }).click();
    await card.getByRole("region", { name: "Latest saved mission" }).waitFor();
    assert.equal(await card.getByLabel("Step 1", { exact: true }).inputValue(), "Recovered step");
    await card.getByRole("button", { name: "Use reviewed draft" }).click();
    await card.getByRole("button", { name: "Save changes", exact: true }).click();
    await saved(page);
    assert.equal(state.missions[0].checklist[0].title, "Recovered step");
    assert.equal(state.saves, 1);
  });

  await scenario("storage failure stays visible and saving remains available", {}, async (page, state) => {
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error("Fixture storage unavailable"); }; });
    const card = page.locator("form").first();
    await card.getByLabel("My mission", { exact: true }).fill("Save even without browser storage");
    await card.getByText(/This draft could not be kept/).waitFor();
    await card.getByRole("button", { name: "Save changes", exact: true }).click();
    await saved(page);
    assert.equal(state.missions[0].writing, "Save even without browser storage");
  });

  await scenario("pending step text survives refresh and Save adds it to the checklist", {}, async (page, state) => {
    const card = page.locator("form").first();
    await card.getByLabel("New step", { exact: true }).fill("A step I have not added yet");
    await page.reload();
    await page.waitForFunction(() => document.querySelector('input[aria-label="New step"]')?.value === "A step I have not added yet");
    await card.getByRole("button", { name: "Save changes", exact: true }).click();
    await saved(page);
    assert.equal(state.missions[0].checklist[0].title, "A step I have not added yet");
    assert.equal(await card.getByLabel("New step", { exact: true }).inputValue(), "");
  });

  await scenario("saving in a second tab cannot erase the first tab's draft", {}, async (page, state) => {
    const firstCard = page.locator("form").first();
    await firstCard.getByLabel("My mission", { exact: true }).fill("My first tab writing must survive");
    const second = await page.context().newPage();
    try {
      await second.goto(`${base}/missions`);
      const secondCard = second.locator("form").first();
      await secondCard.getByLabel("Mission title", { exact: true }).fill("Second tab saved mission");
      await secondCard.getByRole("button", { name: "Save changes", exact: true }).click();
      await saved(second);
      await page.reload();
      await page.waitForFunction(() => document.querySelector("textarea")?.value === "My first tab writing must survive");
      assert.equal(await firstCard.getByLabel("My mission", { exact: true }).inputValue(), "My first tab writing must survive");
      assert.equal(state.missions[0].title, "Second tab saved mission");
    } finally { await second.close(); }
  });

  await scenario("failed cleanup does not recover an already saved creation", {}, async (page, state) => {
    await page.evaluate(() => { Storage.prototype.removeItem = () => { throw new Error("Fixture cleanup unavailable"); }; });
    await page.getByRole("button", { name: "Add mission", exact: true }).click();
    const card = page.locator("form").first();
    await card.getByLabel("Mission title", { exact: true }).fill("Saved once");
    await card.getByLabel("My mission", { exact: true }).fill("No duplicate creation on refresh");
    await card.getByRole("button", { name: "Save mission", exact: true }).click();
    await page.getByText(/browser draft could not be cleared/).waitFor();
    await page.reload();
    await page.getByRole("button", { name: "Add mission", exact: true }).waitFor();
    assert.equal(await page.locator("#mission-new-title").count(), 0);
    assert.equal(state.saves, 1);
  });

  await scenario("mobile icon picker and cards stay inside the viewport", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, async (page) => {
    assert.deepEqual(await page.locator("nav").getByRole("link").allTextContents(), ["My day", "Goals", "Missions", "Planning", "Notes", "Reflection", "Progress"]);
    await page.getByRole("button", { name: "Choose mission icon" }).tap();
    await page.getByRole("button", { name: "Heart icon" }).tap();
    await page.getByRole("button", { name: "Save changes" }).tap();
    await saved(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    await page.screenshot({ path: "/private/tmp/focusos-life-mobile.png", fullPage: true });
  });

  await scenario("load failures can retry and dashboard has no timer controls", {}, async (page, state) => {
    state.failLoad = true;
    await page.reload();
    await page.getByRole("alert").waitFor();
    state.failLoad = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByLabel("Mission title", { exact: true }).waitFor();
    await page.goto(base);
    await page.getByText("No mission yet today.", { exact: true }).waitFor();
    assert.equal(await page.getByText("Pomodoro timer", { exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Start focus", exact: true }).count(), 0);
    await page.screenshot({ path: "/private/tmp/focusos-no-timer.png", fullPage: true });
  });
  console.log(`${passed} browser scenarios passed.`);
} finally { await browser.close(); }
