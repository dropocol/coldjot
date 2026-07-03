-- Plan 10: SequenceContact failure tracking for the schedule path's inline
-- send loop. The ScheduleProcessor sends directly (not via the EMAIL queue),
-- so BullMQ attempts don't bound its retries; this counter does.
-- Additive only: both columns have defaults, so existing rows backfill cleanly.
ALTER TABLE "SequenceContact" ADD COLUMN "failureCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SequenceContact" ADD COLUMN "lastError" TEXT;
