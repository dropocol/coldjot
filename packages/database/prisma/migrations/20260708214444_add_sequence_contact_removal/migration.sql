-- Additive: soft-remove tombstone + enrollment source attribution.
-- removedAt:    nullable tombstone (NULL = active). Mirrors Contact.deletedAt.
-- source:       NOT NULL DEFAULT 'direct' — backfills existing rows to 'direct'
--               (safe default: existing enrollments won't be auto-removed since
--               we can't know their true origin).
-- sourceListId: nullable; set only on list-sourced enrollments.
ALTER TABLE "SequenceContact" ADD COLUMN "removedAt" TIMESTAMP(3);
ALTER TABLE "SequenceContact" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'direct';
ALTER TABLE "SequenceContact" ADD COLUMN "sourceListId" TEXT;

-- Backs the hot "active contacts in a sequence" query (GET contacts + launch).
CREATE INDEX "SequenceContact_sequenceId_removedAt_idx"
  ON "SequenceContact"("sequenceId", "removedAt");
