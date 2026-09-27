// Embeds Laww's whole history into Redis once (the coach keeps the last 14
// days fresh by itself). Safe to re-run: unchanged days are skipped.
// Only READS Postgres.
//
//   npm run rag:backfill

import { db } from "@/lib/db";
import { addDays, instantToDay } from "@/lib/day";
import { loadDays } from "@/lib/day-stats";
import { syncDays } from "@/lib/ai/rag";
import { getRedis } from "@/lib/redis";

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

async function main() {
  // The clients read env vars when first used, so loading here is in time.
  process.loadEnvFile(".env");

  const mission = await db.dailyMission.findFirst({ orderBy: { missionDate: "asc" } });
  const reflection = await db.reflection.findFirst({ orderBy: { reflectionDate: "asc" } });
  const note = await db.dailyNote.findFirst({ orderBy: { noteDate: "asc" } });
  const session = await db.focusSession.findFirst({ orderBy: { startedAt: "asc" } });
  const firsts = [
    day(mission?.missionDate),
    day(reflection?.reflectionDate),
    day(note?.noteDate),
    session ? instantToDay(session.startedAt) : null,
  ].filter((d): d is string => !!d);

  if (firsts.length === 0) {
    console.log("No history yet.");
    return;
  }
  const today = instantToDay(new Date());
  let start = firsts.sort()[0];
  let total = 0;
  while (start <= today) {
    const end = addDays(start, 29) < today ? addDays(start, 29) : today;
    const n = await syncDays(await loadDays(start, end));
    console.log(`${start} .. ${end}: embedded ${n} day(s)`);
    total += n;
    start = addDays(end, 1);
  }
  console.log(`Done. ${total} day(s) embedded.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
    await (await getRedis().catch(() => null))?.close();
  });
