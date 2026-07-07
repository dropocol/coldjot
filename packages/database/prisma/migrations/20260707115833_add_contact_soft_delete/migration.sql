-- Add soft-delete (deletedAt) to Contact.
--
-- Additive + behavior-preserving:
--   1. Adds nullable "deletedAt" column. NULL = active; non-null = soft-deleted
--      (tombstone timestamp). Existing rows get NULL (= active), so no backfill.
--   2. Adds a composite index (userId, deletedAt) to keep the per-user
--      "active contacts" list query fast as the soft-deleted tail grows.
--
-- No constraint changes. The @@unique([userId, email]) constraint is LEFT AS-IS:
-- re-importing a soft-deleted email restores the row (flips deletedAt back to NULL)
-- rather than colliding — handled in the batch upsert path, not in the schema.
--
-- Safe to run on any DB without a backup (additive, reversible via DROP COLUMN).
-- No orphan checks needed (column is nullable, populates NULL for all rows).

ALTER TABLE "Contact" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Contact_userId_deletedAt_idx" ON "Contact"("userId", "deletedAt");
