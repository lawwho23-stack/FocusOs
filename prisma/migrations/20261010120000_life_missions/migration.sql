CREATE TABLE "LifeMission" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "writing" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'compass',
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LifeMission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LifeMission_createdAt_idx" ON "LifeMission"("createdAt");
