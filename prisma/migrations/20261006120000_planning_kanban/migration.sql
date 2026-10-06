ALTER TYPE "PlanningStatus" ADD VALUE 'action';
ALTER TABLE "PlanningIdea" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
WITH ordered AS (
  SELECT "id", (ROW_NUMBER() OVER (PARTITION BY "status" ORDER BY "createdAt" DESC, "id" DESC) - 1)::INTEGER AS position
  FROM "PlanningIdea"
)
UPDATE "PlanningIdea" AS plan SET "position" = ordered.position FROM ordered WHERE plan."id" = ordered."id";
CREATE INDEX "PlanningIdea_status_position_idx" ON "PlanningIdea"("status", "position");
