# Consolidate mailops into the Next.js App (Single-Service Architecture)

> **Severity:** 🟡 Architectural (not a bug fix — a simplification with real tradeoffs)
> **Effort:** Large (3–5 days for the migration itself; plus testing)
> **Depends on:** In the `plans/refactor-plan/` folder, read plans 03 (mailops auth), 05 (tracking), and 10 (job resilience) first — those fixes are easier to land *before* you move the code, because you'll be rewriting these paths anyway. If you go with **Option A** below, plans 03 and 10 become unnecessary (no internal auth boundary, no BullMQ to harden).

---

## Why this plan exists

You've noticed that some apps don't run a separate backend service for background work — they use a **simple trigger mechanism** (a cron job or a `setInterval`) that hits a Next.js API endpoint at intervals, and that endpoint does the work directly against the database. No second app, no Express server, no separate deploy. You want to know if ColdJot can do the same.

**Short answer: Yes, mostly — and for your deployment model it's a good fit.** But there are three things mailops currently does that don't map cleanly to "an API endpoint that runs occasionally," and how you handle those three things determines whether this is a 2-day simplification or a 3-week rewrite. This plan walks through each.

---

## What mailops actually does today

Before deciding, it's critical to separate mailops's responsibilities into "easy to move" and "hard to move." I read every route, worker, and background service.

### A. HTTP routes (the "API layer") — EASY to move

These are just Express handlers that the web app calls over HTTP or that external services call as webhooks. Every one of them becomes a Next.js API route with ~no logic change:

| Current mailops route | What it does | Next.js target |
|---|---|---|
| `POST /api/sequences/:id/launch` | Enqueues a sequence job | `app/api/sequences/[id]/launch/route.ts` (already exists in web!) — just inline the work |
| `POST /api/sequences/:id/pause` | Pauses a sequence | `app/api/sequences/[id]/pause/route.ts` |
| `POST /api/sequences/:id/resume` | Resumes a sequence | `app/api/sequences/[id]/resume/route.ts` |
| `POST /api/sequences/:id/reset` | Resets a sequence | `app/api/sequences/[id]/reset/route.ts` |
| `POST /api/mailbox/watch` | Arms Gmail push notifications on a mailbox | `app/api/mailboxes/[id]/watch/route.ts` |
| `DELETE /api/mailbox/watch/:email` | Stops a Gmail watch | `app/api/mailboxes/[email]/watch/route.ts` |
| `POST /api/lists/:listId/sync` | Triggers a list→sequence sync | `app/api/lists/[id]/sync/route.ts` |
| `GET /api/track/:hash` | Email-open pixel | `app/api/track/[...slug]/route.ts` (already exists in web, currently a no-op — see plan 05) |
| `GET /api/track/:hash/click` | Link-click redirect | same area |
| `POST /api/track/events` | Records a tracking event | same area |
| `POST /pubsub` (and `/api/pubsub`) | Gmail PubSub webhook — verifies Google's JWT, processes the notification | `app/api/pubsub/route.ts` |
| `GET /api/health`, `/api/metrics` | Ops endpoints | `app/api/health/route.ts`, `app/api/metrics/route.ts` |

**These are the bulk of mailops's surface area by file count, and they're trivial to port.** Most of the "controller" logic already exists in `apps/web/src/app/api/...` — the web app already has `/api/sequences/[id]/launch` etc., it just *calls mailops* instead of doing the work itself. You'd flip that: do the work inline.

### B. The email scheduler — MEDIUM to move (this is the "simple mechanism")

`apps/mailops/src/services/jobs/schedule/processor.ts` runs a **repeating BullMQ job** (`upsertJobScheduler` every `CHECK_INTERVAL` ms) that:

1. Queries `SequenceContact` rows where `nextScheduledAt <= now()` and the sequence is active.
2. For each, computes which step is next, checks business hours, respects rate limits.
3. Enqueues an `EmailJob` to the email queue (or schedules it for later if outside business hours).

**This is exactly the "trigger an endpoint at intervals" pattern you're describing.** It becomes a cron-triggered Next.js route:

```
GET/POST /api/cron/process-scheduled-emails
  → query DB for due SequenceContacts
  → for each: send the email (or reschedule if outside business hours)
  → return { processed: N }
```

No BullMQ needed for this part — the **database is the queue.** `nextScheduledAt` is already the scheduling field; `status` is already the state machine. You're just replacing "BullMQ worker polls Redis" with "cron polls Postgres."

### C. BullMQ workers + delayed jobs — HARD to move (the real decision)

This is the part that doesn't have a trivial "just use cron" answer:

| Worker | What it does | Why it's hard to move |
|---|---|---|
| `EmailProcessor` | Sends a single email (Gmail API call, rate-limit check, tracking record, thread update) | Currently invoked via BullMQ `queue.add(emailJob)` with optional `delay`. In a cron model you'd call `sendEmail()` directly from the cron route — fine. But you lose BullMQ's **automatic retries** (a flaky Gmail 5xx currently can be retried; in cron you'd need to implement retry logic yourself). |
| `SequenceProcessor` | Processes sequence enrollment (figures out first step, schedules first email) | Same — currently a queued job. Can become a direct function call from the launch route. |
| `ContactProcessor`, `ListSyncProcessor` | Bulk operations on contacts/lists | Same pattern. |
| **BullMQ delayed jobs** | `addEmailJob` can take a `scheduledTime` → BullMQ holds the job in Redis until then | **This is the feature with no direct cron equivalent.** If you enqueue "send this email in 3 hours," BullMQ delivers it at exactly that time via Redis. Without a queue, you store `nextScheduledAt` in the DB and the cron picks it up on the next tick (up to `CHECK_INTERVAL` late). For cold email, a 1-minute jitter is totally acceptable. |

**The crux:** BullMQ gives you (a) retries with backoff, (b) delayed delivery, (c) a dead-letter queue, and (d) Bull-Board for ops visibility. Plan 10 adds idempotency too. If you remove BullMQ, you need to replace each of these with a DB-based equivalent. It's not hard, but it's work.

---

## The three options

### Option A — Full consolidation, no queue (the "simple mechanism") ✅ RECOMMENDED for your setup

**Replace BullMQ entirely. The database is your queue. Cron is your scheduler.**

```
                    ┌─────────────────────────────┐
  External cron ───▶│  Next.js API route           │──▶ Postgres (nextScheduledAt, status)
  (every 1 min)     │  /api/cron/process-emails    │──▶ Gmail API (send)
                    │  /api/cron/renew-watches     │──▶ cleanup logic
                    └─────────────────────────────┘
```

- **All HTTP routes** → Next.js API routes (table in section A).
- **Email scheduler** → `/api/cron/process-scheduled-emails`, hit every 60s.
- **Watch cleanup** → `/api/cron/renew-watches`, hit every few hours.
- **Email sending** → a direct `sendEmail()` function call from the cron route (or from the launch route for immediate sends).
- **Retries** → a `retryCount` + `nextRetryAt` column on the relevant row; the cron picks up rows where `nextRetryAt <= now() AND retryCount < MAX`.
- **Delayed delivery** → store `nextScheduledAt`; the cron picks it up within 1 minute of the target time.
- **Rate limiting** → keep Redis for distributed rate limiting (optional), or move to a DB-based token bucket.
- **PubSub webhook** → Next.js API route that verifies Google's JWT and processes the notification inline (or writes a row for the cron to pick up).

**Redis becomes optional** (only needed if you want distributed rate limiting or a cache). BullMQ, Bull, Bull-Board, Express, and the entire `apps/mailops` app get deleted.

**Why this fits you:** Your repo has no `vercel.json`, ships a `docker-compose.yml` with Postgres + Redis, and runs `node dist/server.js` in production. You're **self-hosted on a VPS**, not on Vercel serverless. That means:
- No function timeout — a cron route can run for 30s+ processing a batch.
- You can run a real crontab (or `node-cron` inside the Next.js process, or an external service like cron-job.org / GitHub Actions).
- You already manage Postgres; adding scheduling columns is trivial.

**Tradeoffs:**
- ❌ You lose BullMQ's polished retry/backoff/DLQ/Bull-Board. You rebuild them (simply) in the DB.
- ❌ Up to 1-minute jitter on scheduled send times (vs BullMQ's exact delayed delivery). For cold outreach, irrelevant.
- ❌ A crashed cron run loses in-flight work (but since state is in the DB, the next tick resumes — no data loss).
- ✅ One app, one deploy, one codebase, one set of env vars, one auth model.
- ✅ Far less infrastructure (no worker process to keep alive, no Redis for queues).
- ✅ Plan 03's "no auth between web and mailops" problem **disappears entirely** — there's no internal boundary to secure.

### Option B — Consolidation keeping a tiny BullMQ worker

Move all HTTP routes to Next.js (section A), move the scheduler to cron (section B), **but keep BullMQ for the email queue** running as a minimal standalone worker (`apps/worker` or even a script inside `apps/web`).

- You keep retries/backoff/DLQ/delayed-delivery for free.
- The worker is ~50 lines: instantiate the queues + processors, run.
- Still two processes (Next.js + worker), but the worker is trivial and has no HTTP surface.

**Choose this if:** you're nervous about reimplementing retries, or you send high volume where BullMQ's efficiency matters. But honestly, for cold-email volume (not a transactional email firehose), Option A's DB-based retries are plenty.

### Option C — Replace BullMQ with a managed queue (Inngest / Trigger.dev / Upstash Qstash)

The "serverless-native" answer. The queue service holds the jobs and calls back into your Next.js API routes as HTTP requests. Your routes are stateless; the managed service handles retries, delays, scheduling, DLQ.

- ✅ Truly no worker process, no Redis, no cron to manage.
- ✅ Best-in-class retry/visibility for zero infrastructure.
- ❌ External dependency + cost (Inngest/Trigger.dev have free tiers then paid).
- ❌ Vendor lock-in; learning curve.
- ❌ Overkill if you're self-hosted anyway.

**Choose this only if** you're planning to move to Vercel/serverless in the future. For a VPS setup, it's unnecessary.

---

## Recommendation

**Option A.** Your deployment is self-hosted, your volume is cold-email (not high-throughput transactional), and the bulk of mailops is HTTP routes that trivially become Next.js routes. The only genuinely hard part (BullMQ retries/delays) is replaceable with a few DB columns and a cron tick. You eliminate an entire application, its auth boundary (plan 03), its deploy, and half the cross-app complexity surfaced in the other plans.

**Do the consolidation AFTER plans 01, 02, 05.** Those security fixes are easier to apply to the current structure (where the boundaries are explicit) than to do mid-migration. Once the code is correct *and* in one place, it stays correct.

---

## Implementation steps (Option A)

### Step 0 — Decide the cron mechanism

Pick one (all work fine on a VPS):

| Mechanism | How | Notes |
|---|---|---|
| **System crontab** | `* * * * * curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/process-emails` | Simplest. Reliable. Already have `CRON_SECRET` in env. |
| **`node-cron` inside Next.js** | A `instrumentation.ts` hook starts a `setInterval` in the Next.js server process | No external dependency, but couples scheduling to the web process (if Next.js restarts, the timer resets — fine for 1-min granularity). |
| **External service** (cron-job.org, GitHub Actions, Healthchecks.io) | Hits the public URL on a schedule | Gives you free uptime monitoring + doesn't depend on your server being the scheduler. Good for `renew-watches` (less frequent). |

**Recommendation:** system crontab for `/api/cron/process-emails` (every minute), and either crontab or an external service for the less-frequent jobs. Either way, each cron route is protected by `CRON_SECRET` header check (you already have the env var).

### Step 1 — Add the scheduling/retry columns to the DB

You need DB state to replace what BullMQ was holding in Redis. Add to `schema.prisma`:

```prisma
model SequenceContact {
  // ...existing fields...
  retryCount     Int       @default(0)
  nextRetryAt    DateTime?
  // nextScheduledAt already exists — reuse it for scheduling
}

model EmailTracking {
  // ...existing fields...
  jobId        String?    // for idempotency (plan 10)
  retryCount   Int        @default(0)
  nextRetryAt  DateTime?
  status       String     @default("pending") // pending|sent|failed|retrying
}

// Optional: a generic "outbox" for ad-hoc async work (list sync, etc.)
model AsyncTask {
  id        String   @id @default(cuid())
  type      String   // "list_sync" | "contact_import" | ...
  payload   Json
  status    String   @default("pending") // pending|processing|done|failed
  retryCount Int     @default(0)
  nextRetryAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status, nextRetryAt])
}
```

Migrate:
```bash
cd packages/database && npx prisma migrate dev --name add_scheduling_and_async_task_state
```

### Step 2 — Port the email scheduler to a cron route

Create `apps/web/src/app/api/cron/process-scheduled-emails/route.ts`. The logic comes straight from `apps/mailops/src/services/jobs/schedule/processor.ts:processScheduledEmails()` — you're moving it, not rewriting it:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@coldjot/database";
import { sendEmail } from "@/lib/email";       // moved from mailops (Step 5)
import { env } from "@/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — VPS has no real limit; this is for safety

export async function POST(req: Request) {
  // Auth: only the cron caller
  if (req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const batch = await prisma.sequenceContact.findMany({
    where: {
      nextScheduledAt: { lte: new Date(), not: null },
      completed: false,
      status: "in_progress",
      sequence: { status: "active" },
    },
    take: 50, // bounded batch per tick — if there's more, next tick gets it
    include: { sequence: { include: { steps: true, businessHours: true } }, contact: true },
  });

  let processed = 0;
  for (const sc of batch) {
    try {
      // ...the step-lookup, business-hours, rate-limit logic from ScheduleProcessor...
      await sendEmail({ /* EmailJob fields from sc */ });
      await prisma.sequenceContact.update({
        where: { id: sc.id },
        data: { lastProcessedAt: new Date(), nextScheduledAt: /* next step's time or null */ },
      });
      processed++;
    } catch (error) {
      // DB-based retry instead of BullMQ backoff
      await prisma.sequenceContact.update({
        where: { id: sc.id },
        data: {
          retryCount: { increment: 1 },
          nextRetryAt: new Date(Date.now() + backoffMs(sc.retryCount)),
        },
      });
    }
  }

  return NextResponse.json({ processed, total: batch.length });
}

function backoffMs(retryCount: number): number {
  return Math.min(5_000 * 2 ** retryCount, 5 * 60_000); // 5s, 10s, 20s, 40s, 80s cap 5min
}
```

Key differences from the BullMQ version:
- `take: 50` bounds the work per tick (so a huge backlog doesn't make one request run forever).
- Retry is `retryCount` + `nextRetryAt` in the DB, picked up by the next tick.
- No `queue.add()` — `sendEmail()` is called directly.

### Step 3 — Port the watch-cleanup to a cron route

`apps/mailops/src/services/watch/cleanup.ts` → `apps/web/src/app/api/cron/renew-watches/route.ts`. Same logic (find watches nearing expiration, renew them, delete old history), triggered every 6 hours instead of via `setInterval`:

```bash
# crontab
0 */6 * * * curl -sf -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/renew-watches
```

### Step 4 — Port the HTTP routes to Next.js API routes

For each row in the table in section A, create (or extend) the corresponding `apps/web/src/app/api/.../route.ts`. The controller logic moves over almost verbatim — it's mostly Prisma calls + Gmail client calls, both of which already work from `apps/web` (it already imports `@coldjot/database`).

Special notes:
- **`/api/sequences/[id]/launch`** already exists in web (it currently calls mailops). Replace the `fetch(mailopsUrl)` call with the direct work (enroll contacts, set `nextScheduledAt`, return).
- **`/api/pubsub`** — the Google JWT verification (`verifyPubSubJwt`) moves to `apps/web/src/lib/auth/pubsub.ts` (web already has a `lib/auth/` folder). The PubSub push endpoint URL (configured in Google Cloud) changes from `https://your-vps/api/pubsub` (mailops) to `https://your-domain/api/pubsub` (web). Update the subscription's `pushEndpoint` in Google Cloud Console, or re-run the subscription setup.
- **Tracking routes** — see plan 05; they move to web (which already has a stub at `/api/track/[...slug]`).

### Step 5 — Move the shared libraries

These mailops modules are reused by the cron routes and need to live in `apps/web/src/lib/`:

| From (mailops) | To (web) | Notes |
|---|---|---|
| `lib/email/index.ts` (EmailService.sendEmail) | `apps/web/src/lib/email/index.ts` | The core send path |
| `lib/google/gmail/*`, `lib/google/account/*`, `lib/google/smtp/*` | `apps/web/src/lib/google/` | Web already has a `lib/google/` — merge |
| `lib/tracking/index.ts` | `apps/web/src/lib/tracking/index.ts` | |
| `lib/schedule/index.ts` (ScheduleGenerator) | `apps/web/src/lib/schedule/index.ts` | Business-hours logic |
| `lib/placeholders.ts` | `apps/web/src/lib/placeholders.ts` | Template variable substitution |
| `services/watch/index.ts` (WatchService) | `apps/web/src/lib/watch/index.ts` | Gmail watch arm/renew/stop |

Consider extracting truly-shared code (email composition, schedule math) into `packages/types` or a new `packages/outreach` package so it's not duplicated — but for the migration, copying into `apps/web/src/lib/` is fine and you can extract later.

### Step 6 — Handle rate limiting without BullMQ's RateLimitService

`apps/mailops/src/services/core/rate-limit/service.ts` is an in-memory singleton — it won't work across multiple Next.js workers or restarts. Replace with one of:

- **Redis-based token bucket** (keep Redis just for this): `ioredis` + a Lua script for atomic check-and-decrement. Web already has Redis access patterns.
- **DB-based rate limiting**: a `RateLimit` table keyed by `(userId, windowStart)` with a counter. Simpler, slightly less precise.

For cold-email volume, DB-based is fine. Pick Redis only if you already have it running and want sub-second precision.

### Step 7 — Replace Bull-Board with a simple admin page

If you want job visibility, build a small admin route in Next.js:
- `app/admin/tasks/page.tsx` — lists `AsyncTask` rows with status/retryCount.
- `app/admin/emails/page.tsx` — lists `EmailTracking` rows with status.

This is simpler than Bull-Board and lives in the app you already have. Gate it behind the admin role check from plan 01.

### Step 8 — Update env and config

- **Delete** `NEXT_PUBLIC_MAILOPS_API_URL` (no more mailops).
- **Delete** `apps/web/src/lib/queue/queue-api-client.ts` (the mailops HTTP client).
- **Keep** `CRON_SECRET` (protects cron routes).
- **Keep** all Google/PubSub secrets (move from `apps/mailops/env/` to `apps/web/env/`).
- The PubSub `pushEndpoint` (currently a hardcoded ngrok fallback — plan 03) becomes `env.NEXT_PUBLIC_APP_URL + "/api/pubsub"`.

### Step 9 — Update the PubSub push subscription

The Gmail PubSub subscription currently pushes to the mailops URL. After migration:
1. Update `PUBSUB_AUDIENCE` env to point at the web app's `/api/pubsub`.
2. In Google Cloud Console, update the subscription's push config OIDC token audience and URL.
3. Test by sending a test email to a watched mailbox and confirming the webhook fires.

### Step 10 — Delete mailops

Once everything is ported and verified:

```bash
rm -rf apps/mailops
# Update root package.json workspaces (remove apps/mailops reference)
# Update turbo.json if it has mailops-specific tasks
```

Also remove from root `package.json` scripts anything that references mailops (`start:prod`, etc. — adjust the turbo pipeline).

### Step 11 — Update `docker-compose.yml` and deploy

- Redis can stay (for rate limiting / caching) or be removed if you go DB-only.
- Postgres stays.
- The deploy is now just `apps/web` (Next.js) + Postgres (+ optional Redis) + crontab.
- Add the crontab entries to your deployment config (systemd timer, or a cron container, or the host's crontab).

---

## What you gain / lose

### Gained
- **One app, one deploy, one codebase.** Half the moving parts.
- **No internal auth boundary** — plan 03 (the entire "secure mailops" effort) becomes moot. There's no second service to authenticate.
- **No BullMQ/Bull/Redis-queue infrastructure** to operate, monitor, or debug.
- **No worker process to keep alive** — if the web app is up, scheduling works.
- **One set of env vars, one logger, one error path.**
- **Local dev is simpler** — `npm run dev` starts everything; no second terminal for mailops.

### Lost (and how to mitigate)
- **BullMQ's exact-delay delivery** → replaced by DB `nextScheduledAt` + 1-min cron. Acceptable for cold email.
- **Automatic retries with exponential backoff** → replaced by `retryCount`/`nextRetryAt` columns + the `backoffMs()` helper. Equivalent behavior, slightly more code.
- **Bull-Board** → replaced by a simple admin page reading the `AsyncTask`/`EmailTracking` tables.
- **In-memory rate limiting** → replaced by Redis or DB token bucket (more correct anyway — the current in-memory limiter is broken across instances).
- **The PubSub handler's long-running processing** (it currently does multi-step Gmail API calls per notification) → either process inline in the webhook (if fast enough) or write an `AsyncTask` row and let the cron pick it up.

---

## Mapping table: every mailops file → its destination

| mailops file | Destination | Notes |
|---|---|---|
| `routes/sequence/controller.ts` (launch/pause/resume/reset) | Inline into `apps/web/src/app/api/sequences/[id]/{launch,pause,resume,reset}/route.ts` | The launch route already exists in web |
| `routes/mailbox.ts` (watch arm/stop) | `apps/web/src/app/api/mailboxes/[id]/watch/route.ts` | |
| `routes/lists/index.ts` (sync) | `apps/web/src/app/api/lists/[id]/sync/route.ts` | |
| `routes/tracking/controller.ts` | `apps/web/src/app/api/track/[...slug]/route.ts` (already exists, currently no-op) | See plan 05 |
| `routes/pubsub.ts` | `apps/web/src/app/api/pubsub/route.ts` | Move `verifyPubSubJwt` to `lib/auth/pubsub.ts` |
| `routes/health/`, `routes/metrics/` | `apps/web/src/app/api/{health,metrics}/route.ts` | |
| `services/jobs/schedule/processor.ts` | `apps/web/src/app/api/cron/process-scheduled-emails/route.ts` | Core cron route |
| `services/watch/cleanup.ts` | `apps/web/src/app/api/cron/renew-watches/route.ts` | |
| `services/jobs/email/processor.ts` | `apps/web/src/lib/email/index.ts` (sendEmail) + the cron route calls it | |
| `services/jobs/sequence/processor.ts` | `apps/web/src/lib/sequence/enroll.ts` + called from the launch route | |
| `services/jobs/contact/processor.ts`, `list/processor.ts` | `apps/web/src/app/api/cron/process-async-tasks/route.ts` (reads `AsyncTask` table) | Generic async-task processor |
| `services/pubsub/handler.ts` | `apps/web/src/lib/pubsub/handler.ts` + called from the pubsub route | |
| `services/pubsub/client.ts` (subscription setup) | `apps/web/src/lib/pubsub/subscription.ts` + called from a one-off setup script or the cron | Subscription setup moves to a script |
| `lib/email/`, `lib/google/`, `lib/tracking/`, `lib/schedule/`, `lib/placeholders.ts` | `apps/web/src/lib/{email,google,tracking,schedule,placeholders}` | |
| `services/service-manager.ts`, `jobs/job-manager.ts`, `jobs/base-processor.ts`, all BullMQ config | **DELETE** | No queue → no manager |
| `config/queue/`, Bull-Board setup | **DELETE** | |
| `server.ts`, `routes/index.ts` | **DELETE** (Express app gone) | |

---

## Verification

### Per-route (after each port)
- `POST /api/sequences/<id>/launch` → sequence enrolls contacts, `nextScheduledAt` is set on `SequenceContact` rows. (Previously: called mailops which enqueued a BullMQ job.)
- Within 1 minute of a `nextScheduledAt`, the cron fires and the email sends. Verify in Gmail + `EmailEvent` table.
- `POST /api/pubsub` with a valid Google JWT → processes the notification. With an invalid JWT → 401.
- Watch renewal: set a watch's `expiration` to near-now, trigger `/api/cron/renew-watches`, confirm it's renewed in Gmail.

### End-to-end
- Full flow: create sequence → add contacts → launch → emails send on schedule over the next interval → opens/clicks record → stats update. All from one running `npm run dev`.

### Cleanup
- `grep -r "mailops" apps/` returns nothing (no leftover references).
- `grep -r "bullmq\|bull" apps/` returns nothing.
- `apps/mailops` directory is deleted.
- The deploy is: Next.js + Postgres (+ optional Redis) + crontab. Nothing else.

---

## Risks & rollback

- **Biggest risk: a subtle BullMQ behavior you depend on that the DB model doesn't replicate.** Before deleting mailops, run both in parallel for a week — mailops does the real work, the cron routes run against a staging DB in "shadow" mode, and you compare outputs. Only cut over when they agree.
- **PubSub subscription cutover** requires updating Google Cloud config — coordinate the timing so you don't miss notifications during the switch.
- **Cron reliability** — if your cron host is down, scheduling pauses. Mitigate with an external cron service (cron-job.org / Healthchecks.io) that alerts you on missed pings.
- **Batch size tuning** — `take: 50` per tick is a starting guess. If you have bursts (e.g. 1000 contacts launching at once), either raise the batch, shorten the interval, or both. Monitor the cron route's duration.
- **Retry storms** — if Gmail is down, every due email fails and schedules a retry, which fans out. Add a circuit breaker: if the last N sends to Gmail all failed, pause processing and alert (don't keep retrying every contact).
- **Rollback:** keep `apps/mailops` on a branch until you're confident. The DB changes (Step 1) are additive columns, so rolling back the code doesn't require reverting the migration — the columns just go unused. Reverting means redeploying mailops + repointing the PubSub subscription.

---

## Decision checklist before starting

Answer these before committing to Option A:

1. **Are you self-hosted (VPS/Docker), not on Vercel serverless?** If Vercel: the function timeout will bite you — go with Option C instead.
2. **Is your email volume "cold outreach" (hundreds to low-thousands per day), not a high-throughput transactional firehose?** If high-throughput: keep BullMQ (Option B).
3. **Are you OK with up to 1-minute jitter on scheduled send times?** Cold email: yes. Time-critical notifications: no.
4. **Are you willing to maintain ~30 lines of retry/backoff logic in the DB instead of relying on BullMQ?** It's simple, but it's yours to own.
5. **Do you want to delete an entire application and its auth boundary?** (This is the real win.)

If you answered yes to all five, Option A is right for you.
