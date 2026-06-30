# Plan 10 — Backend Job Resilience: Retries, Backoff, DLQ, Error Handling

> **Severity:** 🟡 MEDIUM
> **Effort:** Medium (~1–2 days)
> **Depends on:** Plan 09 (redaction, so retry logs don't leak PII). Independent otherwise.

---

## Problem

The BullMQ-based job system in `apps/mailops` has several resilience gaps. A single transient failure (DB blip, Gmail 5xx, Redis hiccup) silently drops an email or loops forever.

### 1. No worker-level retries configured

`apps/mailops/src/services/jobs/base-processor.ts` (the `BaseProcessor` class every worker extends) never sets `attempts` or `backoff` on the BullMQ `Worker`. `apps/mailops/src/services/jobs/job-manager.ts` `queue.add(...)` calls (L24–29, L64–72) set only `removeOnComplete`/`removeOnFail` — no `attempts`.

**Result:** a thrown error in `process()` fails the job **immediately, zero retries**. A flaky Gmail API call = a lost email with no automatic recovery.

### 2. Error-swallowing in the schedule processor

`apps/mailops/src/services/jobs/schedule/processor.ts:600–605` catches errors and rewrites `nextScheduledAt` to retry later. This can **silently loop a failing email forever** — the contact stays "scheduled," never surfaces as failed, and the user sees no error.

### 3. `onStalled` only warns

`apps/mailops/src/services/jobs/base-processor.ts:92–94` — stalled jobs (worker crashed mid-process) log a warning but aren't re-queued or moved to a DLQ. The job is effectively lost.

### 4. No dead-letter queue (DLQ)

Failed jobs are removed (`removeOnFail` is set) or left in the failed set with no operational visibility. There's no dedicated DLQ for manual inspection/replay, and Bull-Board is wired up (`@bull-board/api` is a dependency) but it's unclear if it's mounted for ops access.

### 5. Idempotency not guaranteed

If retries are added, the same email could be sent twice unless the processor is idempotent. The `ProcessedMessage` table (schema L510) deduplicates Gmail inbound messages, but the **outbound** email path doesn't have an equivalent guard — a retried `EmailJob` could double-send.

### 6. Inconsistent retry mechanisms

- PubSub history processing: `exponential-backoff` lib, `maxRetries=3` (`services/pubsub/handler.ts:242–277`).
- `refreshAccessToken`: manual retry loop (`lib/google/account/google-account.ts:11–71`).
- Schedule processor: its own retry-via-reschedule (`processor.ts:600–605`).

Three different retry strategies for three different paths — no shared policy.

### 7. The `start:prod` command uses `--expose-gc`

`apps/mailops/package.json:12`: `"start:prod": "NODE_ENV=production node --expose-gc dist/server.js"`. `--expose-gc` is fine but suggests manual GC tuning — verify there's actually a `global.gc()` call somewhere using it, otherwise remove the flag (it's a footgun if untrusted code ever runs).

---

## Goal

1. Every queue has a **consistent retry policy**: e.g. 5 attempts with exponential backoff.
2. Jobs that exhaust retries move to a **dead-letter queue** for inspection/replay.
3. Stalled jobs are **automatically retried** (BullMQ supports this).
4. The schedule processor surfaces permanent failures instead of looping forever.
5. The email-sending path is **idempotent** so retries can't double-send.
6. Bull-Board (or equivalent) is mounted for ops to inspect/replay failed jobs.
7. One shared retry/backoff config, not three ad-hoc strategies.

---

## Implementation steps

### Step 1 — Define a shared retry policy

`apps/mailops/src/config/queue/policy.ts`:

```ts
export const JOB_RETRY = {
  attempts: 5,
  backoff: {
    type: "exponential" as const,
    delay: 5_000, // 5s, 10s, 20s, 40s, 80s
  },
};

export const JOB_DEFAULTS = {
  removeOnComplete: 100,   // keep last 100 completed for debugging
  removeOnFail: 1000,      // keep last 1000 failed (DLQ alternative)
};
```

### Step 2 — Apply the policy at enqueue time

`apps/mailops/src/services/jobs/job-manager.ts`:

```ts
import { JOB_RETRY, JOB_DEFAULTS } from "@/config/queue/policy";

async addEmailJob(data: EmailJob) {
  await this.emailQueue.add("send-email", data, {
    ...JOB_DEFAULTS,
    attempts: JOB_RETRY.attempts,
    backoff: JOB_RETRY.backoff,
  });
}
```

Apply the same to every `queue.add` in `job-manager.ts`.

### Step 3 — Configure the Worker for stalls & retries

`apps/mailops/src/services/jobs/base-processor.ts` — pass worker options when creating the `Worker`:

```ts
new Worker(name, processor, {
  connection,
  concurrency: 10,
  stalledInterval: 30_000,    // check for stalls every 30s
  maxStalledCount: 1,         // a job stalled once is moved to failed
  lockDuration: 60_000,       // 60s before a job is considered stalled
});
```

Update `onStalled` (L92–94) to log at `error` level and emit an alert metric — BullMQ will auto-move it to failed based on `maxStalledCount`.

### Step 4 — Make the email processor idempotent

Before sending, check whether this job has already been processed (e.g. a `sentMessageId` on `EmailTracking` or a dedicated `EmailJobResult` table keyed by job id):

```ts
// apps/mailops/src/services/jobs/email/processor.ts
async function processEmail(job: Job<EmailJob>) {
  // Idempotency guard
  const alreadySent = await prisma.emailTracking.findFirst({
    where: { jobId: job.id, status: "sent" },
  });
  if (alreadySent) {
    logger.info({ jobId: job.id }, "email already sent, skipping");
    return;
  }
  // ... send
  // After successful send, record the result with the job id
  await prisma.emailTracking.update({ where: {...}, data: { jobId: job.id, status: "sent" } });
}
```

This requires adding a `jobId String?` column to `EmailTracking` (or a dedicated table) — a small migration.

> Gmail also returns a `messageId` on send — store it and treat "we already have a sent row with this messageId" as idempotency evidence for defense-in-depth.

### Step 5 — Fix the schedule-processor retry loop

`apps/mailops/src/services/jobs/schedule/processor.ts:600–605` currently re-schedules on error. Replace with:

- Let the error propagate (so BullMQ's retry policy handles it per Step 2).
- After exhausting retries (use the `failed` event in `base-processor.ts`), **mark the sequenceContact as failed** so it surfaces in the UI:
  ```ts
  await prisma.sequenceContact.update({
    where: { sequenceId_contactId: { sequenceId, contactId } },
    data: { status: "failed" },
  });
  ```
- Only re-schedule if the error is explicitly transient (e.g. a 5xx from Gmail) AND below the retry cap.

### Step 6 — Add a dead-letter queue

For jobs that exhaust all attempts, move them to a DLQ for inspection:

```ts
// base-processor.ts
worker.on("failed", async (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, "job permanently failed");
  if (job && job.attemptsMade >= JOB_RETRY.attempts) {
    await this.dlQueue.add(job.name, job.data, { jobId: job.id });
    // optionally emit an alert metric
  }
});
```

Each queue gets a paired `<name>:dl` queue. Ops can inspect/replay from there.

### Step 7 — Mount Bull-Board for ops visibility

`@bull-board/api` and (likely) `@bull-board/express` are dependencies. Mount a protected admin UI:

```ts
// apps/mailops/src/server.ts
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

const serverAdapter = new ExpressAdapter();
createBullBoard({ queues: [...], serverAdapter });
app.use("/admin/queues", requireServiceToken, serverAdapter.getRouter()); // plan 03
```

Gate it behind the service token (or a dedicated admin auth).

### Step 8 — Consolidate the ad-hoc retry mechanisms

- Remove the manual `exponential-backoff` retry in `services/pubsub/handler.ts:242–277` if the BullMQ retry policy now covers it (depends on whether PubSub processing goes through a queue or runs inline — verify).
- Keep the `refreshAccessToken` retry (it's a library-level concern) but align its `maxRetries` with `JOB_RETRY.attempts` for consistency.

### Step 9 — Add alerting on failure rates

Emit a metric (Prometheus counter or a simple log line consumed by your monitoring) on:
- Job permanently failed (DLQ move)
- Stall detected
- Queue depth exceeding a threshold

This gives ops visibility without needing to watch Bull-Board constantly.

### Step 10 — Remove `--expose-gc` if unused

Grep for `global.gc` in `apps/mailops/src`. If it's not called, remove `--expose-gc` from `start` and `start:prod` scripts — it adds attack surface for no benefit.

---

## Files to touch

**Create:**
- `apps/mailops/src/config/queue/policy.ts` (shared retry config)

**Modify:**
- `apps/mailops/src/services/jobs/job-manager.ts` (apply retry policy at enqueue)
- `apps/mailops/src/services/jobs/base-processor.ts` (worker options, stall handling, DLQ on `failed`)
- `apps/mailops/src/services/jobs/email/processor.ts` (idempotency guard)
- `apps/mailops/src/services/jobs/schedule/processor.ts` (stop infinite loop, mark failed)
- `apps/mailops/src/server.ts` (mount Bull-Board)
- `apps/mailops/package.json` (remove `--expose-gc` if unused)
- `packages/database/prisma/schema.prisma` (add `jobId` to `EmailTracking`)
- A new Prisma migration for the `jobId` column

---

## Verification

- **Retry behavior:** temporarily make the email processor throw on the first 2 attempts. Confirm BullMQ retries 3x with exponential backoff and succeeds on the 3rd. Before the fix: it would fail immediately.
- **DLQ:** force a job to fail all 5 attempts. Confirm it appears in the `<name>:dl` queue and in Bull-Board.
- **Stall:** kill the worker mid-process. Confirm the job is detected as stalled within `stalledInterval` and retried (then DLQ'd if it stalls again).
- **Idempotency:** manually re-enqueue a sent email job (simulate a retry after a successful send). Confirm it's skipped, not double-sent. Inspect Gmail (or the sent-mail log) for duplicates.
- **Schedule loop:** trigger a permanent failure in the schedule path. Confirm the `sequenceContact.status` becomes `"failed"` and the user sees it in the UI, rather than it silently re-scheduling forever.
- **Bull-Board:** visit `/admin/queues` (with the service token) and confirm all queues are visible with their jobs.

---

## Risks & rollback

- **Retries can amplify load** during an outage (every failing job retries 5x). Mitigate with reasonable backoff (exponential) and consider a circuit breaker for downstream failures (e.g. stop enqueueing if Gmail is down).
- **Idempotency guard adds a DB query per job.** For high volume this is a small cost; acceptable.
- **`maxStalledCount: 1`** means a genuinely-long-running job that exceeds `lockDuration` is failed. Set `lockDuration` generously enough for your slowest job (email send shouldn't take >60s, but verify).
- **DLQ storage grows** if not drained. Add retention (`removeOnFail: 1000`) and a process to inspect/replay.
- **Adding the `jobId` column** is a migration; backfill existing rows with `null` (they predate the guard). Rollback by dropping the column.
- **Rollback:** revert the retry policy (set `attempts: 1`); the DLQ and Bull-Board are additive.
