CREATE TYPE "PlanningStatus" AS ENUM ('saved', 'planned', 'done', 'archived');

CREATE TABLE "PlanningIdea" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "writing" TEXT NOT NULL,
    "problem" TEXT,
    "audience" TEXT,
    "why" TEXT,
    "firstStep" TEXT,
    "revisitWhen" TEXT,
    "status" "PlanningStatus" NOT NULL DEFAULT 'saved',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanningIdea_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlanningIdea_createdAt_idx" ON "PlanningIdea"("createdAt");
