# Mailops Refactor — Handoff & Continuation Guide

> **Last updated:** Phase 0, Groups A/B/C complete (23/~85 characterization tests).
> **Branch:** `refactor/mailops-phase-0-tests` (off `refactor/mailops`)
> **Working tree:** clean. Safe to pick up in a new session.

## Where things are

```
master
  └─ refactor/mailops                       ← base; plan docs + decisions
       └─ refactor/mailops-phase-0-tests    ← CURRENT — Phase 0 in progress
            ├── ✅ Group A: email-service.test.ts       (6 cases)
            ├── ✅ Group B: tracking-service.test.ts    (9 cases)
            ├── ✅ Group C: pubsub-handler.test.ts      (8 cases)
            └── ⬜ Groups D–O: not yet written          (~60 cases)
```

## How to resume Phase 0

### 1. Get to the right state

```bash
cd "/Volumes/Data/00-My Projects/ColdJot/coldjot"
git checkout refactor/mailops-phase-0-tests

# Sanity check — all green:
npm test -w mailops          # 23 tests, 3 files, all pass
npx tsc --noEmit -p apps/mailops/tsconfig.json   # clean
```

### 2. Pick the next group

The recommended order (quickest wins first):

| Order | Group | Why this order | Effort |
|---|---|---|---|
| 1 | **L** placeholders | pure functions, no fakes needed | 15 min |
| 2 | **M** email-subject | pure functions, no fakes needed | 20 min |
| 3 | **K** schedule-generator | pure functions + fake timers for DST | 30 min |
| 4 | **N** rate-limiter | needs ioredis fake OR test class directly | 30 min |
| 5 | **D** schedule-processor | needs fake JobManager; reuses prisma fake | 40 min |
| 6 | **H** list-sync processor | reuses prisma fake | 20 min |
| 7 | **I** contact-processor | reuses prisma fake | 15 min |
| 8 | **J** gmail-client | mock googleapis; test token refresh | 30 min |
| 9 | **O** watch-cleanup | reuses prisma fake | 20 min |
| 10 | **E** sequence-controller | needs supertest | 45 min |
| 11 | **F** mailbox-routes | needs supertest | 30 min |
| 12 | **G** tracking-routes | needs supertest; pixel Buffer + UA filtering | 40 min |

### 3. Write a group (the recipe)

Every test file follows the same shape:

```ts
// src/__tests__/characterization/<name>.test.ts
import { setupTestContext } from "@/__tests__/helpers/test-context";
const ctx = setupTestContext();

import { /* code under test */ } from "@/path/to/module";

beforeEach(() => {
  ctx.reset();
  // ctx.fake.seed("model", { ... }, ["uniqueField"]);
  // ctx.gmailResponses.send = { ... };        // for gmail paths
});

describe("[Group X] <feature>", () => {
  it("case 1: <behavior>", async () => {
    // seed state
    // call the code under test
    // assert on ctx.fake.calls (recorded prisma ops)
    // assert on ctx.fake.stores.<model>.rows.values() (rows written)
    // assert on ctx.stats (the updateSequenceStats spy)
    // assert on ctx.fakeGmail.calls (transport ops)
  });
});
```

**Key assertions to use:**
- `wasCalledWith(ctx, "modelName", "op", { partialArgs })` — checks a recorded prisma call matches a partial shape.
- `ctx.fake.stores.emailEvent.rows.values()` — read back rows that were written.
- `ctx.stats` — the `updateSequenceStats` vi.fn spy; use `.toHaveBeenCalledWith(...)`.
- `ctx.fakeGmail.calls` — recorded Gmail transport ops.

**Mocking global `fetch`** (for REST paths like PubSub):
```ts
const fakeFetch = vi.fn(async (input) => { /* route by URL */ });
vi.stubGlobal("fetch", fakeFetch);
beforeEach(() => { vi.stubGlobal("fetch", fakeFetch); fakeFetch.mockClear(); });
```

**Unique fields:** when seeding a row that the code looks up by `findUnique({ where: { field } })`, pass the field as a third arg: `ctx.fake.seed("model", row, ["fieldName"])`. The fake auto-registers `id`, `hash` (emailTracking), `email` (mailbox/emailWatch), but other unique fields must be declared explicitly.

### 4. After each group

```bash
npm test -w mailops                    # all tests pass
npx tsc --noEmit -p apps/mailops/tsconfig.json   # clean
git add -A && git commit -m "test(mailops): phase 0 — Group X <name> characterization (N cases)"
```

Update `plans/mailops-refactor/PHASE-0-PROGRESS.md` — flip the group's row to ✅ and update the totals.

### 5. When all 15 groups are done

```bash
# Merge the phase-0 branch back into the base
git checkout refactor/mailops
git merge --no-ff refactor/mailops-phase-0-tests -m "merge: phase 0 — characterization tests complete (all 15 groups)"

# Update STATUS.md — Phase 0 → ✅ DONE
# Then start Phase 1 from a new sub-branch:
git checkout -b refactor/mailops-phase-1-seams
```

## Common pitfalls (already solved — don't re-hit these)

1. **`vi.mock` + TDZ:** the `test-context.ts` uses `vi.hoisted` for the holder because `vi.mock` factories are hoisted above imports. Don't import the fakes at the top of `test-context.ts` and reference them in the factory — use the holder pattern that's already there.

2. **Proxy-as-handler bug:** the fake prisma's model proxies must use a *plain handler object* (`makeModelHandler(model)`), not a Proxy as the handler arg. Already fixed — don't regress.

3. **`vi.unstubAllGlobals()` in afterEach:** don't call it — it restores the real `fetch`, breaking subsequent tests. Re-stub in `beforeEach` instead.

4. **Unique fields:** `findUnique({ where: { threadId } })` only resolves if `threadId` was registered as unique via `seed(model, row, ["threadId"])`. The fake auto-registers `id`/`hash`/`email` but nothing else.

5. **`getClient` mutation leak:** when a test swaps `gmailClientService.getClient` to throw (e.g. the 401 cases), save + restore it in a `try/finally` so it doesn't pollute the next test.

6. **`processedMessage` unique field:** `isMessageProcessed` queries by `messageId` (not `id`) — seed with `["messageId"]`.

7. **`emailThread` unique field:** `processBounce`/`processReply` query by `threadId` — seed with `["threadId"]`.

8. **`sequenceStats` unique field:** `trackEmailEvent` queries by `sequenceId` — seed with `["sequenceId"]`.

## What each remaining group needs

- **L (placeholders):** `lib/placeholders/index.ts` — `replacePlaceholders(content, { contact })` + `validatePlaceholders`. Pure. No fakes.
- **M (email-subject):** `lib/email-subject.ts` — `determineEmailSubject(step, threadId, gmail, contact)`. Pure except it may call gmail for thread subject; mock `@/lib/google` (already mocked).
- **K (schedule-generator):** `lib/schedule/index.ts` — `ScheduleGenerator.calculateNextRun`. Use `vi.useFakeTimers()` with fixed dates for DST.
- **N (rate-limiter):** `lib/rate-limiter.ts` — `RateLimiter` class (Redis-backed token bucket). Either mock ioredis or test via `RateLimitService` with a fake Redis.
- **D (schedule-processor):** `services/jobs/schedule/processor.ts` — `ScheduleProcessor`. Needs a fake `JobManager` (record `addEmailJob` calls). Polls `SequenceContact.nextScheduledAt`.
- **H (list-sync):** `services/jobs/list/processor.ts` — `ListSyncProcessor`. Reuses prisma fake.
- **I (contact-processor):** `services/jobs/contact/processor.ts` — `ContactProcessor`. Reuses prisma fake.
- **J (gmail-client):** `lib/google/gmail/gmail.ts` — `GmailClientService` + `lib/google/gmail/helper.ts refreshTokenIfNeeded`. Mock `googleapis`.
- **O (watch-cleanup):** `services/watch/cleanup.ts` — `WatchCleanupService`. Reuses prisma fake.
- **E (sequence-controller):** `routes/sequence/controller.ts`. Install `supertest` + `@types/supertest` as devDeps. Mount just the sequence router on a minimal Express app.
- **F (mailbox-routes):** `routes/mailbox.ts`. Same supertest approach. Mock `WatchService`.
- **G (tracking-routes):** `routes/tracking/controller.ts`. supertest. The transparent-pixel Buffer, `X-Robots-Tag` header, Gmail-compose-view referer filtering, Googlebot UA filtering, safe-redirect check.

## The locked decisions (don't re-litigate)

| Decision | Outcome |
|---|---|
| SMTP path | **Delete** in Phase 4b. `MailTransport` interface preserved for future providers. |
| Dormant ThreadProcessor (846 lines) | **Delete** in Phase 5. `InboxSource` is the future seam. |
| Infra singletons (Redis/MemoryMonitor/RateLimit/PubSub) | **Keep** as process-wide singletons. |
| Characterization tests | **Delete** in Phase 7.9 once the permanent suite covers every feature. |
| Prisma | **The only ORM.** No Drizzle. Repository interfaces exist for testability, not for swapping ORMs. |

## The full plan

- [`plans/mailops-refactor/README.md`](./README.md) — overview + decisions
- [`plans/mailops-refactor/STATUS.md`](./STATUS.md) — phase tracker
- [`plans/mailops-refactor/plan.md`](./plan.md) — the 8-phase overview
- [`plans/mailops-refactor/phase-0-characterization-tests.md`](./phase-0-characterization-tests.md) — this phase's detail + coverage matrix
- [`plans/mailops-refactor/PHASE-0-PROGRESS.md`](./PHASE-0-PROGRESS.md) — live progress tracker
- [`plans/mailops-refactor/phase-{1..7}-*.md`](./) — the other phases (not yet started)
