-- Plan 10: EmailTracking.jobId + index.
-- Additive only: nullable column, no backfill. Used by the email processor's
-- idempotency guard to detect a BullMQ job that already sent.
ALTER TABLE "EmailTracking" ADD COLUMN "jobId" TEXT;

CREATE INDEX "EmailTracking_jobId_idx" ON "EmailTracking"("jobId");
