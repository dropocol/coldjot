# Phase 0 — Characterization Tests (the safety net)

> **Goal:** before touching any production code, capture the *current* behavior of **every mailops feature** so we can prove every later phase preserves it. These tests are **not** "good unit tests" — they pin what the code does *today*, whether or not that's ideal.
>
> **Sub-branch:** `refactor/mailops/phase-0-tests` (off `refactor/mailops`)
> **Estimated effort:** 2–3 days (expanded from the original scope — see Coverage matrix)
> **Behavior change:** none — production code is untouched; only tests added.

## First step — branch setup

```bash
git checkout refactor/mailops
git checkout -b refactor/mailops/phase-0-tests
```

## Why this phase exists

There are zero tests under `apps/mailops/` today. The refactor plan moves ~3,000 lines of business logic across files. Without a net, "did I break anything?" becomes "did I read carefully enough?" — which is exactly what you said you can't verify by running the live system.

A characterization test answers one question: **given this input, does the code still produce the same output?** If yes, the move was safe. The assertions are on observable surfaces (DB rows written, jobs enqueued, transport calls made) — never on internal call order.

## Approach

- **Vitest** — the test plan (`plans/test-suite/`) picks Vitest; reuse it. Add it to `apps/mailops` (devDependency) and a `test` script.
- **No Prisma singleton mocking via module replacement** (fragile). Instead, Phase 1 introduces constructor injection. For Phase 0, **before that injection exists**, use a two-step trick:
  1. Write the test against the *current* exported class (e.g. `emailService`).
  2. Use `vi.mock("@coldjot/database", ...)` to swap `prisma` for an in-memory fake that records calls. Provide a minimal in-memory implementation (a plain object with `Map`s keyed by model name) — only the methods the code path actually calls.
  3. Mock `googleapis` similarly — record `users.messages.send` / `.get` / `.insert` / `.delete` calls and return canned responses.
- **Each test asserts on three surfaces:**
  1. **DB rows written** — which Prisma `create`/`update` calls were made, with what data.
  2. **Transport calls** — which Gmail/SMTP methods were invoked, with what args.
  3. **Jobs enqueued** — for the ScheduleProcessor test only.

## Files to create

```
apps/mailops/
├── vitest.config.ts                              — Vitest config (Node env, alias "@/" → "./src")
├── src/__tests__/
│   ├── setup.ts                                  — loads env, sets NODE_ENV=test
│   └── characterization/
│       ├── email-service.test.ts                 — EmailService.sendEmail (group A)
│       ├── tracking-service.test.ts              — TrackingService + standalone fns (group B)
│       ├── pubsub-handler.test.ts                — PubSubHandler.handleNotification (group C)
│       ├── schedule-processor.test.ts            — ScheduleProcessor (group D)
│       ├── sequence-controller.test.ts           — launch/pause/resume/reset (group E)
│       ├── mailbox-routes.test.ts                — watch setup/teardown (group F)
│       ├── tracking-routes.test.ts               — pixel + click redirect + UA filtering (group G)
│       ├── list-sync.test.ts                     — ListSyncProcessor (group H)
│       ├── contact-processor.test.ts             — ContactProcessor (group I)
│       ├── gmail-client.test.ts                  — OAuth client + token refresh (group J)
│       ├── schedule-generator.test.ts            — business-hours/DST next-run math (group K)
│       ├── placeholders.test.ts                  — {{firstName}} substitution + validation (group L)
│       ├── email-subject.test.ts                 — Re:/Fwd: thread subject resolution (group M)
│       ├── rate-limiter.test.ts                  — token-bucket rate limit (group N)
│       └── watch-cleanup.test.ts                 — WatchCleanupService renewal (group O)
└── src/__tests__/helpers/
    ├── fake-prisma.ts                            — in-memory Prisma stub (records all calls)
    ├── fake-gmail.ts                             — canned gmail_v1.Gmail stub
    ├── fake-fetch.ts                             — global fetch() recorder for REST calls
    └── fake-bullmq.ts                            — in-memory Job + Queue stubs
```

## Coverage matrix

Every mailops feature must have at least one characterization test pinning its current behavior. This is the authoritative list — when Phase 7 retires these tests (see Phase 7.9), each row must be covered by a permanent test before its characterization counterpart is deleted.

| # | Feature | Source file:fn | Test file | Cases |
|---|---|---|---|---|
| **A** | Email send (Gmail API) | `lib/email/index.ts:46 EmailService.sendEmail` | `email-service.test.ts` | tracked send; disable-sending; auth-failure (TOKEN_EXPIRED); untracked-copy insert + original delete; missing-template fallback |
| **B** | Tracking (open/click/event) | `lib/tracking/index.ts` (`TrackingService` + standalone fns) | `tracking-service.test.ts` | first open; repeat open; link click; createTracking happy + missing-field; trackEmailEvent SENT/OPENED/CLICKED/REPLIED/BOUNCED rate math; updateTrackingStats parity |
| **C** | PubSub inbox sync | `services/pubsub/handler.ts:63 PubSubHandler.handleNotification` | `pubsub-handler.test.ts` | reply; bounce; original/no-op; already-processed; large history gap; missing watch; missing mailbox |
| **D** | Schedule tick | `services/jobs/schedule/processor.ts ScheduleProcessor` | `schedule-processor.test.ts` | N due contacts → N email jobs; delay applied; paused sequence skipped; completed contact skipped; business-hours window respected |
| **E** | Sequence lifecycle | `routes/sequence/controller.ts` (`launchSequence`, `pauseSequence`, `resumeSequence`, `resetSequenceHandler`) | `sequence-controller.test.ts` | launch happy; not-found; no-steps; no-contacts; default-business-hours creation; pause; resume; reset (rate-limit clear + status→draft) |
| **F** | Mailbox watch | `routes/mailbox.ts` (POST/DELETE /watch) | `mailbox-routes.test.ts` | setup watch happy; teardown; missing mailbox; duplicate setup |
| **G** | Tracking pixel + click | `routes/tracking/controller.ts` (`handleEmailOpen`, `handleLinkClick`, `trackEmailEvent`) | `tracking-routes.test.ts` | pixel served; Gmail compose view skipped; Googlebot skipped; click redirect happy; unsafe-redirect scheme blocked; missing linkId; invalid event type rejected |
| **H** | List sync | `services/jobs/list/processor.ts ListSyncProcessor` | `list-sync.test.ts` | sync happy; dedup; partial failure |
| **I** | Contact sync | `services/jobs/contact/processor.ts ContactProcessor` | `contact-processor.test.ts` | upsert happy; dedup by email |
| **J** | Gmail OAuth client | `lib/google/gmail/gmail.ts GmailClientService` + `helper.ts refreshTokenIfNeeded` | `gmail-client.test.ts` | get client happy; token refresh on expiry; refresh failure; cached token reuse |
| **K** | Schedule generator | `lib/schedule/index.ts ScheduleGenerator.calculateNextRun` | `schedule-generator.test.ts` | business-hours window; outside-hours → next day; weekend skip; DST boundary; custom schedule |
| **L** | Placeholders | `lib/placeholders/index.ts replacePlaceholders` + `validatePlaceholders` | `placeholders.test.ts` | `{{firstName}}` substituted; missing field surfaced; multiple placeholders; nested contact fields |
| **M** | Email subject resolution | `lib/email-subject.ts determineEmailSubject` | `email-subject.test.ts` | new thread; reply (Re: inheritance); Fwd:; missing original subject; thread-header lookup |
| **N** | Rate limiter | `lib/rate-limiter.ts RateLimiter` (token bucket) | `rate-limiter.test.ts` | under-limit allowed; over-limit rejected; window refill; resetLimits clears |
| **O** | Watch cleanup | `services/watch/cleanup.ts WatchCleanupService` | `watch-cleanup.test.ts` | renews expiring watch; skips fresh watch; renewal failure logged |

> **Total: ~75–90 characterization test cases across 15 files.** This is the safety net for the entire refactor — no feature ships to Phase 1+ without a pinned test.

## Step-by-step

### Step 0.1 — Wire Vitest into mailops

- `apps/mailops/package.json`: add `"vitest": "^2.x"` to devDeps; set `"test": "vitest run"` and `"test:watch": "vitest"`.
- Create `apps/mailops/vitest.config.ts`:
  ```ts
  import { defineConfig } from "vitest/config";
  import path from "node:path";
  export default defineConfig({
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
    test: { environment: "node", setupFiles: ["./src/__tests__/setup.ts"] },
  });
  ```
- `src/__tests__/setup.ts`: set `process.env.NODE_ENV = "test"`, load `.env.test` if present, ensure `MAILOPS_PUBSUB_ENABLED=false`.

**Verify:** `npm test --filter mailops` runs (zero tests pass — that's fine).

### Step 0.2 — Build the fakes

**`helpers/fake-prisma.ts`** — a minimal Prisma stub. Don't reimplement Prisma; record calls.

```ts
type ModelName = "emailTracking" | "emailEvent" | "trackedLink" | "linkClick"
  | "sequenceStats" | "sequenceContact" | "sequence" | "sequenceStep"
  | "mailbox" | "emailWatch" | "emailWatchHistory" | "processedMessage"
  | "businessHours" | "template" | "contact" | "emailThread";

interface RecordedCall { model: ModelName; op: string; args: any; }

export function makeFakePrisma() {
  const calls: RecordedCall[] = [];
  const stores: Record<ModelName, Map<string, any>> = /* ...one Map per model */;
  const handler: ProxyHandler<...> = {
    get: (_, model: ModelName) => new Proxy({}, {
      get: (_, op: string) => async (args: any) => {
        calls.push({ model, op, args });
        // Minimal real behavior for the ops the code paths use:
        //   .create → push into store, return the row
        //   .update / .findFirst / .findUnique → look up in store
        //   .$transaction → run the callback with the same fake
        return /* ... */;
      },
    }),
  };
  return { prisma: new Proxy({} as any, handler), calls, stores };
}
```

The key principle: **the fake only needs to behave correctly for the specific code path under test.** Each test seeds the stores with the rows that path will look up; everything else can return `null`.

**`helpers/fake-gmail.ts`** — a `gmail_v1.Gmail` stub:

```ts
export function makeFakeGmail(responses: {
  send?: Partial<gmail_v1.Schema$Message>;
  get?: Partial<gmail_v1.Schema$Message>;
  insert?: Partial<gmail_v1.Schema$Message>;
}) {
  const calls: any[] = [];
  const users = { messages: {
    send: async (a: any) => { calls.push({ op: "send", a }); return { data: responses.send ?? { id: "msg-1", threadId: "thr-1" } }; },
    get:   async (a: any) => { calls.push({ op: "get", a });   return { data: responses.get ?? { /* canned headers */ } }; },
    insert:async (a: any) => { calls.push({ op: "insert", a });return { data: responses.insert ?? { id: "msg-2" } }; },
    delete:async (a: any) => { calls.push({ op: "delete", a });return {}; },
  }};
  return { gmail: { users } as unknown as gmail_v1.Gmail, calls };
}
```

### Step 0.3 — Group A: `email-service.test.ts`

Pin `lib/email/index.ts:46 EmailService.sendEmail` behavior. **Five cases:**

1. **Tracked send (happy path)** — `options.disableSending = false`. Seed: `gmail.users.messages.send` returns `{id:"msg-1", threadId:"thr-1"}`; `users.messages.get` returns a payload with `Message-ID` + `Subject` headers. Assert:
   - `prisma.emailTracking.update` called once with `where.id = options.tracking.id`, `data.status = "SENT"`, nested `events.create.type = "SENT"`.
   - `updateSequenceStats` called with `(sequenceId, SENT, contactId)`.
   - `gmail.users.messages.insert` called once (untracked copy).
   - `gmail.users.messages.delete` called once with the original `id`.
   - Returns `{success: true, messageId: "msg-1", threadId: "thr-1"}`.

2. **Disable-sending path** — `options.disableSending = true`. Assert:
   - `updateEmailTracking` + `createEmailEvent` called with fake IDs (`fake-msg-<ts>`, `fake-thread-<ts>`).
   - **No** Gmail send/insert/delete calls.
   - Returns `{success: true, isFake: true}`.

3. **Auth-failure throws TOKEN_EXPIRED** — seed `gmail.users.messages.send` to throw `{ status: 401 }`. Assert the thrown error message equals `"TOKEN_EXPIRED"`. Also test the SMTP `535 / AUTH XOAUTH2` variant of the same throw (line 234–238).

4. **Untracked-copy insert + original delete** — verify the exact sequence: send → wait 1s → get details → insert untracked → delete tracked original. Assert call order via the fake's recorded-calls array. Pin the 1-second delay (use `vi.useFakeTimers()`).

5. **Missing-template fallback** — when `step.templateId` is empty, the processor (not the service) skips the template lookup. Pin the service's behavior with an empty `options.html`: assert the untracked-copy block is skipped (the `if (options.html && response.data.id)` guard at line 136).

Mock surface: `vi.mock("@coldjot/database")`, `vi.mock("@/lib/google")` (so `gmailClientService.getClient` returns the fake), `vi.mock("@/lib/stats")` (so `updateSequenceStats` is a spy).

### Step 0.4 — Group B: `tracking-service.test.ts`

Pin both surfaces (they will collapse into one in Phase 4a — we need to know they currently agree):

1. **`TrackingService.handleEmailOpen(hash)` — first open** — seed store: one `emailTracking` row with `hash`, `openCount: 0`, no prior `OPENED` event. Assert:
   - `emailTracking.update`: `openCount: { increment: 1 }`, `openedAt: <set>`, `status: "OPENED"`, nested `events.create.type = "OPENED"`, `metadata.isFirstOpen = true`.
   - `updateSequenceStats(sequenceId, OPENED, contactId, {isUniqueOpen: true})`.

2. **`handleEmailOpen` — repeat open** — seed: same row + one existing `OPENED` event. Assert:
   - `openCount: { increment: 1 }` still happens.
   - **But** nested `events.create` still fires (current behavior — note this; Phase 4a may change it intentionally).
   - `updateSequenceStats` called with `{isUniqueOpen: false}`.

3. **`TrackingService.handleLinkClick(hash, linkId)` — happy path** — seed: `emailTracking` + one matching `trackedLink` with `originalUrl`. Assert:
   - `$transaction` ran; inside it: `linkClick.create`, `trackedLink.update` (`clickCount: { increment: 1 }`), `emailTracking.update` (nested `events.create.type = "CLICKED"`).
   - `updateSequenceStats(CLICKED)`.
   - Returns `link.originalUrl`.

4. **`recordEmailOpen(hash)` standalone fn** — same scenario as case 1, but call the **exported function**, not the class. Pin its behavior separately. (Phase 4a will delete this duplicate; the test documents what it did.)

5. **`createEmailTracking(metadata)` — happy + missing-field** — happy path: assert the created row's `status = "pending"`, `hash = <48-char nanoid>`, `jobId` is stamped. Missing-field path: throw with message listing missing fields.

6. **`trackEmailEvent(trackingId, type, metadata, trackingData)` — rate math canary** — pin the inline stats math (lines 449–500 of `lib/tracking/index.ts`) for **all five event types**:
   - SENT: given `stats = {sentEmails: 4, openedEmails: 2, clickedEmails: 1, repliedEmails: 0, bouncedEmails: 0}`, assert `updates.openRate = (2/5)*100 = 40`, `clickRate = 20`, `replyRate = 0`, `bounceRate = 0`.
   - OPENED: assert `openRate = ((2+1)/4)*100 = 75`.
   - CLICKED: assert `clickRate = ((1+1)/4)*100 = 50`.
   - REPLIED: assert `replyRate = ((0+1)/4)*100 = 25`.
   - BOUNCED: assert `bounceRate = ((0+1)/4)*100 = 25`.
   - Also pin the `stats not found → create initial stats` branch (line 432).

7. **`updateTrackingStats` parity** — same inputs as case 6, run through `updateTrackingStats` (the `calculateRates` path). Document whether the two paths agree. (They likely differ slightly in the SENT case because `trackEmailEvent` uses `sentEmails + 1` as denominator while `calculateRates` uses `max(sentEmails + 1, 1)` — pin the actual difference.)

### Step 0.5 — Group C: `pubsub-handler.test.ts`

Pin `services/pubsub/handler.ts:63 PubSubHandler.handleNotification` for all classification outcomes + edge cases. Mock: `fetch` (global), `refreshTokenIfNeeded`, the prisma fake, `updateSequenceStats`.

Seed per case: a watch record + a canned `fetchGmailHistory` response containing one `messagesAdded` entry.

1. **Reply path** — message details have `from` ≠ any user email, `in-reply-to` header present. Assert:
   - `EmailEvent` created with `type = "REPLIED"`.
   - `SequenceContact.status` updated (per `determineNewStatus`).
   - `updateSequenceStats(REPLIED)`.

2. **Bounce path** — headers contain `x-failed-recipients`. Assert:
   - `EmailEvent` created with `type = "BOUNCED"`.
   - `SequenceContact.status` updated to bounced/opted-out (whatever current code does — *pin it*).
   - `updateSequenceStats(BOUNCED)`.

3. **Original-message / no-op path** — message from the user's own mailbox. Assert: **no** EmailEvent, **no** SequenceContact update.

4. **Already-processed** — `isMessageProcessed` returns true. Assert: skip, no further calls.

5. **Large history gap** — `calculateHistoryGap` returns a gap above the threshold. Assert: `handleLargeHistoryGap` runs, watch historyId is updated to the latest, a `HISTORY_GAP` EmailWatchHistory record is created, **no** message processing happens.

6. **Missing watch** — no `EmailWatch` row for the notification's email. Assert: returns early, logs warning, no further processing.

7. **Missing mailbox** — watch exists but no `Mailbox` row. Assert: returns early, logs warning.

8. **Token refresh failure** — `getValidAccessToken` returns null. Assert: returns early, logs error, no history fetch.

### Step 0.6 — Group D: `schedule-processor.test.ts`

Pin `services/jobs/schedule/processor.ts` ScheduleProcessor:

1. **N due contacts → N email jobs** — seed 3 `SequenceContact` rows with `nextScheduledAt` in the past, `status = IN_PROGRESS`. Assert 3 `addEmailJob` calls on the fake JobManager, each with correct `sequenceId`, `contactId`, `stepId`, `delay`.

2. **Delay applied** — pin the delay calculation (business-hours-aware). Given a contact due now but outside business hours, assert the job's delay pushes it to the next window.

3. **Paused sequence skipped** — seed a contact whose `Sequence.status = paused`. Assert no job enqueued.

4. **Completed contact skipped** — seed a contact with `status = COMPLETED`. Assert no job enqueued.

5. **Business-hours window respected** — seed a contact due at 03:00 local with business hours 09:00–17:00. Assert the job is delayed until 09:00.

Mock: prisma fake (seed contacts + sequences), `JobManager` fake. Don't run real BullMQ workers.

### Step 0.7 — Group E: `sequence-controller.test.ts`

Pin `routes/sequence/controller.ts` (will move in Phase 2 — pin before the move). Use supertest against an Express app mounted with just the sequence router + faked services.

1. **launch happy** — seed sequence with steps + contacts. Assert 200, `{success, jobId, contactCount, stepCount}`, sequence status → active, job enqueued, monitoring started.
2. **launch not-found** — sequence with wrong userId. Assert 404.
3. **launch no-steps** — sequence with zero steps. Assert 400.
4. **launch no-contacts** — sequence with all contacts completed/opted_out. Assert 400.
5. **launch default-business-hours creation** — sequence with no `BusinessHours` row. Assert a default is created (pin the exact default values from `DEFAULT_BUSINESS_HOURS`).
6. **pause happy** — assert status → paused, monitoring stopped.
7. **resume happy** — assert status → active, monitoring restarted.
8. **reset** — assert rate limits cleared, `resetSequence(id)` called, status → draft, `testMode` + `disableSending` → false.

### Step 0.8 — Group F: `mailbox-routes.test.ts`

Pin `routes/mailbox.ts` (POST/DELETE /watch):

1. **Setup watch happy** — assert WatchService.watch called with the right mailbox + topic, returns watch expiry.
2. **Teardown** — DELETE `/watch/:email` → assert WatchService.stop called.
3. **Missing mailbox** — assert 404.
4. **Duplicate setup** — assert idempotent or error (pin whichever current behavior is).

### Step 0.9 — Group G: `tracking-routes.test.ts`

Pin `routes/tracking/controller.ts`:

1. **Pixel served** — GET `/api/track/:hash.png`. Assert 200, `Content-Type: image/png`, the transparent-pixel Buffer body, `X-Robots-Tag: noindex, nofollow` header, and `trackingService.handleEmailOpen` called.
2. **Gmail compose view skipped** — `referer` includes `mail.google.com/mail/u/.../compose`. Assert 307, pixel served, **no** `handleEmailOpen` call.
3. **Googlebot skipped** — `user-agent` includes `googlebot`. Assert 200, pixel served, **no** `handleEmailOpen` call.
4. **Click redirect happy** — GET `/api/track/:hash/click?lid=link-1`. Assert `trackingService.handleLinkClick` called, response is a 302 redirect to the original URL.
5. **Unsafe redirect blocked** — `handleLinkClick` returns a `javascript:` URL. Assert 400, no redirect.
6. **Missing linkId** — no `lid` query param. Assert 400.
7. **Invalid event type rejected** — POST `/api/track/events` with `eventType: "BOGUS"`. Assert 400. Valid type → assert `trackingService.trackEmailEvent` called.

### Step 0.10 — Group H: `list-sync.test.ts`

Pin `services/jobs/list/processor.ts ListSyncProcessor`:

1. **Sync happy** — seed a list with contacts. Assert `ListSyncRecord` rows created, contacts associated.
2. **Dedup** — contact already in list. Assert not re-added.
3. **Partial failure** — one contact fails (e.g. invalid email). Assert others still sync, failure recorded.

### Step 0.11 — Group I: `contact-processor.test.ts`

Pin `services/jobs/contact/processor.ts ContactProcessor`:

1. **Upsert happy** — new contact by email. Assert created.
2. **Dedup by email** — existing email. Assert updated, not duplicated.

### Step 0.12 — Group J: `gmail-client.test.ts`

Pin `lib/google/gmail/gmail.ts GmailClientService` + `helper.ts refreshTokenIfNeeded`:

1. **Get client happy** — valid cached token. Assert client returned, no refresh.
2. **Token refresh on expiry** — `expiryDate < now`. Assert refresh called, new token persisted to Mailbox row.
3. **Refresh failure** — Google returns 400 on refresh. Assert error thrown, Mailbox row not corrupted.
4. **Cached token reuse** — second call within validity window. Assert no second refresh.

### Step 0.13 — Group K: `schedule-generator.test.ts`

Pin `lib/schedule/index.ts ScheduleGenerator.calculateNextRun`:

1. **Business-hours window** — 10:00 on Tuesday, hours 09:00–17:00. Assert next run is `step.delayMinutes` later (same day).
2. **Outside hours → next day** — 18:00 Tuesday. Assert next run is next business day 09:00.
3. **Weekend skip** — Friday 18:00. Assert next run is Monday 09:00.
4. **DST boundary** — pin the spring-forward / fall-back transitions (use `vi.useFakeTimers` with a fixed date in a DST-aware timezone like `America/New_York`).
5. **Custom schedule** — non-default `workDays`/`workHours`. Assert respected.

### Step 0.14 — Group L: `placeholders.test.ts`

Pin `lib/placeholders/index.ts replacePlaceholders` + `validatePlaceholders`:

1. **`{{firstName}}` substituted** — assert replaced with contact's first name.
2. **Missing field surfaced** — contact has no firstName. Assert `validatePlaceholders` returns `["firstName"]`.
3. **Multiple placeholders** — `{{firstName}} {{lastName}}`. Assert both replaced.
4. **Nested contact fields** — `{{contact.company}}`. Assert supported (or pinned as unsupported if current code doesn't handle it).

### Step 0.15 — Group M: `email-subject.test.ts`

Pin `lib/email-subject.ts determineEmailSubject`:

1. **New thread** — no threadId. Assert subject is the step/template subject.
2. **Reply (Re: inheritance)** — threadId present, original subject "Hello". Assert returned subject is "Re: Hello".
3. **Fwd:** — pin forward-prefix behavior (if current code handles it).
4. **Missing original subject** — thread has no subject header. Assert fallback to step subject.
5. **Thread-header lookup** — assert the Gmail API call shape (or that no call is made when not `replyToThread`).

### Step 0.16 — Group N: `rate-limiter.test.ts`

Pin `lib/rate-limiter.ts RateLimiter` (Redis-backed token bucket):

1. **Under-limit allowed** — first request. Assert `{allowed: true}`.
2. **Over-limit rejected** — exceed `max` in window. Assert `{allowed: false}`.
3. **Window refill** — advance time past the window. Assert next request allowed.
4. **resetLimits clears** — call `resetLimits(userId, sequenceId)`. Assert subsequent request allowed regardless of prior state.

Mock: ioredis fake (or the `RateLimitService` directly if it wraps the limiter).

### Step 0.17 — Group O: `watch-cleanup.test.ts`

Pin `services/watch/cleanup.ts WatchCleanupService`:

1. **Renews expiring watch** — seed an `EmailWatch` row with expiry < now + threshold. Assert `WatchService.renewWatch` called.
2. **Skips fresh watch** — expiry far in future. Assert no renewal.
3. **Renewal failure logged** — `renewWatch` throws. Assert error logged, loop continues (doesn't crash).

---

## Must-not-change inventory

This is the explicit list of behaviors that must remain byte-identical from Phase 0 through Phase 7. Every row has a characterization test (above) AND a permanent test in Phase 7. **If any of these drifts, the refactor failed.**

| Behavior | Pinned by | Where it ends up after refactor |
|---|---|---|
| Tracked send writes EmailTracking(SENT) + EmailEvent(SENT) + bumps SequenceStats | Group A1 | `SendEmailServiceImpl.send` + repos |
| disableSending returns fake IDs, no Gmail calls | Group A2 | `SendEmailServiceImpl.send` early branch |
| 401/535 → throws `TOKEN_EXPIRED` | Group A3 | `SendEmailServiceImpl.send` catch |
| Send → wait 1s → get → insert untracked → delete tracked | Group A4 | `SendEmailServiceImpl.send` orchestration |
| First open: EmailTracking.openCount++, OPENED event, stats with isUniqueOpen | Group B1 | `TrackingServiceImpl.handleEmailOpen` |
| Repeat open: openCount++ still fires an OPENED event | Group B2 | `TrackingServiceImpl.handleEmailOpen` |
| Click: transaction with LinkClick + TrackedLink++ + CLICKED event | Group B3 | `TrackingServiceImpl.handleLinkClick` |
| Rate math for all 5 event types | Group B6 | `lib/tracking/stats.ts calculateRates` |
| Reply → REPLIED event + contact status change | Group C1 | `InboxSyncServiceImpl` + `apply-classification` |
| Bounce → BOUNCED event + contact status change | Group C2 | same |
| Original message → no-op | Group C3 | same |
| Already-processed message → skip | Group C4 | `InboxSyncServiceImpl` |
| Large history gap → skip + HISTORY_GAP record | Group C5 | `InboxSyncServiceImpl.handleLargeGap` |
| Schedule tick enqueues due contacts with business-hours delay | Group D1–5 | `RunScheduleServiceImpl.tick` |
| Sequence launch/pause/resume/reset contract | Group E1–8 | `LaunchSequenceServiceImpl` |
| Pixel served with correct headers | Group G1 | `controllers/tracking.controller.ts` |
| Gmail compose view + Googlebot skipped | Group G2–3 | same |
| Safe-redirect enforcement | Group G5 | same |
| Invalid event type rejected | Group G7 | same |
| Gmail OAuth refresh-on-expiry + cache | Group J1–4 | `GmailTransport` + `GmailInboxSource` |
| Schedule DST/business-hours math | Group K1–5 | `ScheduleGenerator` (untouched) |
| Placeholder substitution + validation | Group L1–4 | `lib/placeholders` (untouched) |
| Subject Re:/Fwd: inheritance | Group M1–5 | `lib/email-subject` (untouched) |

## Definition of done

- [ ] `npm test` in `apps/mailops` runs and **all 15 test files pass** against **unchanged** production code.
- [ ] Every row in the **Coverage matrix** has at least one passing test case.
- [ ] Every row in the **Must-not-change inventory** is pinned.
- [ ] The `fake-prisma.ts` + `fake-gmail.ts` + `fake-fetch.ts` + `fake-bullmq.ts` helpers are reusable (Phase 3 will swap them for per-repo fakes).
- [ ] The rate-math canary (Group B6) covers **all five** event types, not just SENT.
- [ ] No production file modified (only `package.json` for the vitest dep + the new test files).
- [ ] Sub-branch `refactor/mailops/phase-0-tests` merged back into `refactor/mailops`.

## Risks

| Risk | Mitigation |
|---|---|
| Faking Prisma precisely is tedious | Only fake what the code path calls. Unknown ops can throw — that surfaces missing cases as test failures rather than silent passes. |
| A test pins *buggy* behavior | That's fine and *intended*. Add a `// TODO(behavior):` comment. Phase 4 may deliberately change behavior — at that point the test gets updated in the same commit that changes the behavior, with a clear before/after in the message. |
| Vitest + ESM + `tsx` alias conflicts | Use Vitest's `resolve.alias` (shown above), not `tsconfig` paths. Vitest resolves at runtime. |
| 15 test files feels like a lot | They're the entire safety net. Each is small (3–8 cases). Skipping any means that feature is unverified through the refactor — exactly the risk you said you can't afford. |
| supertest dependency for route tests (Groups E/F/G) | Add to devDeps. Alternatively, call the controller functions directly with mocked `req`/`res` — but supertest is closer to the real HTTP contract and catches middleware-ordering bugs. |

## What to commit

One commit per step (0.1, 0.2, then one per group 0.3–0.17). Each leaves `tsc --noEmit` + lint + tests green. After 0.17, merge `refactor/mailops/phase-0-tests` into `refactor/mailops`.
