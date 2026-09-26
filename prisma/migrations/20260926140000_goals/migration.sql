-- CreateEnum
CREATE TYPE "GoalHorizon" AS ENUM ('quarter', 'year', 'multi_year');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('active', 'achieved', 'dropped');

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "why" TEXT,
    "plan" TEXT,
    "horizon" "GoalHorizon" NOT NULL,
    "targetDate" DATE,
    "status" "GoalStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Goal_status_horizon_idx" ON "Goal"("status", "horizon");

