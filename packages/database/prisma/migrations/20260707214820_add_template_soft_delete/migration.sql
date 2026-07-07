-- Add soft-delete (deletedAt) to Template.
--
-- Additive + behavior-preserving:
--   1. Adds nullable "deletedAt" column. NULL = active; non-null = soft-deleted
--      (tombstone timestamp). Existing rows get NULL (= active), so no backfill.
--   2. Adds a composite index (userId, deletedAt) to keep the per-user
--      "active templates" list query fast as the soft-deleted tail grows.
--
-- No constraint changes, no FK changes. SequenceStep.templateId keeps its
-- onDelete: SetNull — the application-layer active-use guard (sub-plan 03)
-- makes the nulling path unreachable for ACTIVE/PAUSED sequences; soft-delete
-- leaves the FK intact otherwise.
--
-- Safe to run on any DB without a backup (additive, reversible via DROP COLUMN).
-- No orphan checks needed (column is nullable, populates NULL for all rows).

-- AlterTable
ALTER TABLE "Template" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Template_userId_deletedAt_idx" ON "Template"("userId", "deletedAt");
