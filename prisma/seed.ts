import { db } from "../lib/db";

// Seed: creates the one starter project from the architecture doc.
// Run with: npx prisma db seed (after DATABASE_URL is set).
async function main() {
  const existing = await db.project.findFirst({
    where: { name: "FocusOS" },
  });
  if (existing) {
    console.log("Seed skipped: FocusOS project already exists.");
    return;
  }
  const project = await db.project.create({
    data: {
      name: "FocusOS",
      description: "Build and use my personal AI productivity tool",
      status: "active",
      priority: "high",
    },
  });
  console.log("Seed created project:", project.id, project.name);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
