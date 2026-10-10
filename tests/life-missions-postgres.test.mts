import assert from "node:assert/strict";
import test from "node:test";

const url = process.env.LIFE_MISSIONS_TEST_DATABASE_URL;
if (!url) throw new Error("Set LIFE_MISSIONS_TEST_DATABASE_URL to the disposable Life Missions database.");
const target = new URL(url);
if (target.hostname !== "127.0.0.1" || target.port !== "55447" || target.pathname !== "/focusos_life_test") {
  throw new Error("Refusing a non-isolated database.");
}
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
const { db } = await import("../lib/db");
const { POST, GET } = await import("../app/api/life-missions/route");
const { PATCH, DELETE } = await import("../app/api/life-missions/[id]/route");
const input = { title: "Teach", writing: "Make learning accessible", icon: "book", checklist: [] };
const request = (body: unknown) => new Request("http://localhost/api/life-missions", { method: "POST", body: JSON.stringify(body) });
const context = (id: string) => ({ params: Promise.resolve({ id }) });

test.before(async () => {
  const rows = await db.$queryRaw<{ data_directory: string }[]>`SHOW data_directory`;
  if (!/^\/private\/tmp\/focusos-life-pg\.[A-Za-z0-9]+\/data$/.test(rows[0].data_directory)) {
    throw new Error("Refusing a PostgreSQL cluster not created for these checks.");
  }
});
test.after(() => db.$disconnect());

test("real mission API persists edits and checklist progress without changing daily missions", async (t) => {
  const project = await db.project.create({ data: { name: "Life mission isolation fixture" } });
  const daily = await db.dailyMission.create({ data: { projectId: project.id, title: "Daily fixture", missionDate: new Date("2000-01-01T00:00:00Z") } });
  t.after(() => db.project.delete({ where: { id: project.id } }));
  const created = await POST(request(input));
  assert.equal(created.status, 201);
  const mission = await created.json();
  t.after(() => db.lifeMission.deleteMany({ where: { id: mission.id } }));
  const checklist = [{ id: "lesson", title: "Teach one lesson", completed: true }, { id: "tool", title: "Build a tool", completed: false }];
  const patched = await PATCH(request({ ...input, icon: "rocket", checklist, expectedUpdatedAt: mission.updatedAt }), context(mission.id));
  assert.equal(patched.status, 200);
  const persisted = await db.lifeMission.findUniqueOrThrow({ where: { id: mission.id } });
  assert.equal(persisted.icon, "rocket");
  assert.deepEqual(persisted.checklist, checklist);
  const listed = await (await GET()).json();
  assert.ok(listed.some((row: { id: string }) => row.id === mission.id));
  assert.equal((await DELETE(request(null), context(mission.id))).status, 200);
  assert.equal(await db.lifeMission.findUnique({ where: { id: mission.id } }), null);
  assert.equal((await db.dailyMission.findUniqueOrThrow({ where: { id: daily.id } })).title, "Daily fixture");
});

test("concurrent real writes accept one saved version and reject the stale overwrite", async (t) => {
  const mission = await db.lifeMission.create({ data: { ...input, updatedAt: new Date("2001-01-01T00:00:00Z") } });
  t.after(() => db.lifeMission.delete({ where: { id: mission.id } }));
  const version = mission.updatedAt.toISOString();
  const responses = await Promise.all(["First edit", "Second edit"].map((title) => PATCH(request({ ...input, title, expectedUpdatedAt: version }), context(mission.id))));
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  const accepted = await responses.find((response) => response.status === 200)!.json();
  assert.equal((await db.lifeMission.findUniqueOrThrow({ where: { id: mission.id } })).title, accepted.title);
});

test("migration defaults new mission records to Compass and an empty checklist", async (t) => {
  const mission = await db.lifeMission.create({ data: { title: "Defaults", writing: "A life direction" } });
  t.after(() => db.lifeMission.delete({ where: { id: mission.id } }));
  assert.equal(mission.icon, "compass");
  assert.deepEqual(mission.checklist, []);
});
