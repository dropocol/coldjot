/**
 * Shared job-resilience policy — single source of truth for retries, backoff,
 * retention, stall handling, and the schedule-path failure cap.
 *
 * Plan 10 (`plans/refactor-plan/10-backend-job-resilience.md`). The per-queue
 * retry constants in `./index.ts` (`RETRY_OPTIONS`) remain the per-queue
 * override layer; the values here are the defaults used at enqueue time and by
 * the worker stall/DLQ logic.
 */

/** Default retry policy applied at enqueue time. */
export const JOB_RETRY = {
  attempts: 5,
  backoff: {
    type: "exponential" as const,
    delay: 5_000, // 5s, 10s, 20s, 40s, 80s
  },
};

/** Default job retention applied at enqueue time. */
export const JOB_DEFAULTS = {
  removeOnComplete: { count: 100, age: 24 * 60 * 60 }, // 24h
  removeOnFail: { count: 1000, age: 7 * 24 * 60 * 60 }, // 7d
};

/** Worker stall-detection policy. BullMQ defaults leave these unset. */
export const STALL_POLICY = {
  stalledInterval: 30_000, // check for stalls every 30s
  maxStalledCount: 1, // a job stalled once is moved to failed
  lockDuration: 60_000, // 60s before a job is considered stalled
} as const;

/**
 * Cap for the schedule path's inline send loop. The ScheduleProcessor sends
 * emails directly (not via the EMAIL queue), so BullMQ attempts do not apply.
 * This counter bounds how many times a failing contact is retried before it's
 * marked `"failed"` and removed from the poller's query.
 */
export const SCHEDULE_MAX_FAILURES = 5;

/**
 * Backoff between schedule-path retry attempts. Equals the historical
 * `EMAIL_SCHEDULER_CONFIG.RETRY_DELAY` (5 min) — kept constant to preserve
 * existing behavior under the new cap.
 */
export const SCHEDULE_FAILURE_BACKOFF_MS = 5 * 60 * 1000;
