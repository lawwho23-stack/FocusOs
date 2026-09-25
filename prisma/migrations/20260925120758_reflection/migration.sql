-- CreateTable
CREATE TABLE "Reflection" (
    "id" TEXT NOT NULL,
    "reflectionDate" DATE NOT NULL,
    "completedWork" TEXT,
    "blockers" TEXT,
    "distractions" TEXT,
    "energyLevel" INTEGER,
    "lesson" TEXT,
    "nextStartAction" TEXT,
    "aiSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reflection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reflection_reflectionDate_key" ON "Reflection"("reflectionDate");
