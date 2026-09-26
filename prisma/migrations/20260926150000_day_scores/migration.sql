-- CreateTable
CREATE TABLE "DayScore" (
    "id" TEXT NOT NULL,
    "scoreDate" DATE NOT NULL,
    "score" INTEGER NOT NULL,
    "level" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "dataHash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DayScore_scoreDate_key" ON "DayScore"("scoreDate");

