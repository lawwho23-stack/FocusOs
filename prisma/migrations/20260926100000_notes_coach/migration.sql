-- AlterTable
ALTER TABLE "Reflection" ADD COLUMN     "minutesLost" INTEGER;

-- CreateTable
CREATE TABLE "DailyNote" (
    "id" TEXT NOT NULL,
    "noteDate" DATE NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyNote_noteDate_key" ON "DailyNote"("noteDate");

