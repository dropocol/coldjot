# Mailops Refactor — Status

> **Single source of truth** for the refactor's progress, branch layout, locked decisions, and how to resume. (Replaces the former `HANDOFF.md` + `PHASE-0-PROGRESS.md` — both deleted.)
>
> **Picking up mid-phase?** Jump to [Resume guide](#resume-guide).
>
> **Legend:** ⬜ Not started · 🟡 In progress · 🟢 Code done, awaiting verification · ✅ Done · ⏸️ Blocked/Deferred

## At-a-glance

| Phase | Doc | Status | Sub-branch | Effort |
|---|---|---|---|---|
| 0 | [characterization tests](./phase-0-characterization-tests.md) | 🟡 **In progress** — 5/15 groups, 43 cases passing | `refactor/mailops-phase-0-tests` | 2–3 days |
| 1 | [seams + composition root](./phase-1-seams-composition-root.md) | ⬜ Not started | `refactor/mailops-phase-1-seams` | 2–3 days |
| 2 | [routes → controllers](./phase-2-routes-to-controllers.md) | ⬜ Not started | `refactor/mailops-phase-2-controllers` | 1 day |
| 3 | [repositories isolate Prisma](./phase-3-repositories.md) | ⬜ Not started | `refactor/mailops-phase-3-repos` | 3–4 days |
| 4 | [split three god-objects](./phase-4-split-god-objects.md) | ⬜ Not started | `refactor/mailops-phase-4-split` | 5–7 days |
| 5 | [dead code cleanup](./phase-5-dead-code-cleanup.md) | ⬜ Not started | `refactor/mailops-phase-5-cleanup` | 0.5–1 day |
| 6 | [kill ServiceManager singleton](./phase-6-kill-service-manager.md) | ⬜ Not started | `refactor/mailops-phase-6-singleton` | 2 days |
| 7 | [real test suite](./phase-7-test-suite.md) | ⬜ Not started | `refactor/mailops-phase-7-tests` | 3–4 days |

**Estimated total:** ~19–25 days of focused work. Each phase is independently shippable.

## Branch layout

**Base branch:** `refactor/mailops` (off `upgrade/remaining-majors`; plan docs committed at `9bf70cb`).

Sub-branches use the **hyphen** scheme `refactor/mailops-phase-N-<short>` (git rejects the slash scheme — `refactor/mailops` is already a leaf, so `refactor/mailops/phase-N` can't also be a prefix):

```
upgrade/remaining-majors
  └─ refactor/mailops                            ← base; plan docs live here
       └─ refactor/mailops-phase-0-tests         ← CURRENT (5/15 groups done)
            └─ refactor/mailops-phase-1-seams
                 └─ refactor/mailops-phase-2-controllers
                      └─ refactor/mailops-phase-3-repos
                           └─ refactor/mailops-phase-4-split
                                └─ refactor/mailops-phase-5-cleanup
                                     └─ refactor/mailops-phase-6-singleton
                                          └─ refactor/mailops-phase-7-tests
```

**Operating rules:**
- Branch each phase off the *previous* phase's tip (Phase 0 branches off `refactor/mailops`).
- Each phase ends by merging its sub-branch back into `refactor/mailops` (`--no-ff` to preserve the boundary).
- `refactor/mailops` merges to `master` only at the very end (after Phase 7).
- Stop at any phase boundary — each is a safe, shippable checkpoint.

**Quick commands:**
```bash
# Start a phase:
git checkout refactor/mailops-phase-<N-1>-<short>   # previous phase tip
git checkout -b refactor/mailops-phase-<N>-<short>

# Finish a phase:
git checkout refactor/mailops
git merge --no-ff refactor/mailops-phase-<N>-<short> -m "merge: phase N — <title>"
```

## Sequencing rules

- **Phases must ship in order.** Each builds on interfaces / migrations from the previous.
  - Exception: Phase 5 (cleanup) can run in parallel with Phase 6 if needed.
- **Each phase ends green:** `tsc --noEmit` + ESLint + Phase 0 characterization tests all pass.
- **One commit per step** within a phase (each phase doc specifies the commits).

## Locked decisions

All four architectural decisions are settled — don't re-litigate:

| Decision | Outcome |
|---|---|
| ~~SMTP path~~ | **✅ Delete** in Phase 4b. The `useApi = true` branch + `lib/google/smtp/*` + `nodemailer` go. The `MailTransport` interface is preserved as the seam for any future provider (SMTP, Outlook, send-through-API). `lib/email/helper.ts` + `lib/google/gmail/helper.ts` are kept (reused). |
| ~~Dormant ThreadProcessor (846 lines)~~ | **✅ Delete** in Phase 5. It's commented out in `service-manager.ts:174-175` and unreferenced. `InboxSource` is the future seam for any polling/IMAP implementation. |
| ~~Infra singletons~~ | **✅ Keep** `RedisConnection`, `MemoryMonitor`, `RateLimitService`, `PubSubService` as process-wide singletons (constructed inside `createApp()` only). |
| ~~Characterization tests~~ | **✅ Delete** in Phase 7.9 once the permanent suite covers every feature. |

> Future inbox features plug in via the `MailTransport` + `InboxSource` interfaces from Phase 1 — no need to keep dead SMTP/polling code around "just in case".

## Prisma stance

**Prisma 7 is the only ORM. No Drizzle, no raw-SQL layer.** The repository *interfaces* introduced in Phase 1+ exist purely for testability (inject in-memory fakes) and separation of concerns (domain code doesn't import `@prisma/client`). One interface, one Prisma implementation, permanently.

---

## Phase 0 progress — characterization tests

**Goal:** 15 test files (Groups A–O), ~75–90 cases, pinning every mailops feature before any production code moves. Full matrix in [phase-0-characterization-tests.md](./phase-0-characterization-tests.md#coverage-matrix).

**Run:** `npm test -w mailops`

### Group tracker

| Group | Feature | Test file | Cases | Status |
|---|---|---|---|---|
| **A** | Email send (Gmail API) | `email-service.test.ts` | 6 | ✅ done |
| **B** | Tracking (open/click/event + rate math) | `tracking-service.test.ts` | 9 | ✅ done |
| **C** | PubSub inbox sync | `pubsub-handler.test.ts` | 8 | ✅ done |
| **M** | Email subject resolution | `email-subject.test.ts` | 10 | ✅ done |
| **L** | Placeholders | `placeholders.test.ts` | 10 | ✅ done |
| D | Schedule tick | `schedule-processor.test.ts` | ~5 | ⬜ not started |
| E | Sequence lifecycle | `sequence-controller.test.ts` | ~8 | ⬜ not started |
| F | Mailbox watch | `mailbox-routes.test.ts` | ~4 | ⬜ not started |
| G | Tracking pixel + click HTTP | `tracking-routes.test.ts` | ~7 | ⬜ not started |
| H | List sync | `list-sync.test.ts` | ~3 | ⬜ not started |
| I | Contact sync | `contact-processor.test.ts` | ~2 | ⬜ not started |
| J | Gmail OAuth client + token refresh | `gmail-client.test.ts` | ~4 | ⬜ not started |
| K | Schedule generator (DST/business hours) | `schedule-generator.test.ts` | ~5 | ⬜ not started |
| N | Rate limiter | `rate-limiter.test.ts` | ~4 | ⬜ not started |
| O | Watch cleanup | `watch-cleanup.test.ts` | ~3 | ⬜ not started |

**Totals:** 5/15 files · **43/~85 cases** · 43 passing · 0 failing · tsc clean · lint clean (warnings only)

### What's pinned so far

**Group A — EmailService.sendEmail (6 cases) ✅**
- Tracked happy-path send: EmailTracking(SENT) + EmailEvent(SENT) + stats + send→get→get→insert→delete sequence
- disableSending shortcut: fake IDs, no Gmail calls, tracking still written
- 401 → throws TOKEN_EXPIRED
- SMTP 535/AUTH XOAUTH2 → throws TOKEN_EXPIRED
- ~1s delay between send and get-details (fake timers)
- Empty html throws "Content and tracking information are required" *(TODO(behavior) for Phase 4b)*

**Group B — Tracking (9 cases) ✅**
- `handleEmailOpen` first open: openCount++, OPENED event isFirstOpen=true, stats isUniqueOpen:true
- `handleEmailOpen` repeat open: STILL creates OPENED event *(current behavior; Phase 4a may change)*
- `handleLinkClick`: LinkClick + TrackedLink.clickCount++ + CLICKED event + stats, returns URL
- `recordEmailOpen` standalone: mirrors class but sets status to lowercase "opened" *(divergence pinned)*
- `createEmailTracking` happy + missing-field throw
- `trackEmailEvent` rate math: all 5 event types with exact expected values
- `trackEmailEvent` no-stats-row → creates initial stats
- `updateTrackingStats` parity: documents that calculateRates path DISAGREES with inline math

**Group C — PubSubHandler.handleNotification (8 cases) ✅**
- Reply → REPLIED event + contact update + stats
- Bounce → BOUNCED event + contact update + stats
- Original message → no event
- Already-processed → skipped
- Large history gap → HISTORY_GAP record, watch historyId updated
- Missing EmailWatch / Mailbox / token → returns early

**Group L — placeholders (10 cases) ✅**
- `replacePlaceholders`: firstName / lastName / name / email from contact
- Falls back to `fallbacks.*` when contact field is empty/missing
- Composes `name` as `'firstName lastName'` (trimmed) when `contact.name` empty
- Replaces remaining unknown placeholders via fallbacks (any key); leaves unknown placeholders in place when no value exists
- Falsy content returned unchanged
- `extractPlaceholders`: deduped + trimmed names; `[]` for falsy/empty content
- `validatePlaceholders`: `[]` when every placeholder has a contact value or fallback; reports names lacking both
- Divergence pinned: empty-string contact field treated as MISSING by `validatePlaceholders` (falsy check), even though `replacePlaceholders` would substitute `""`

### Harness built (reusable)

- `vitest.config.ts` — node env, globals, `@/` alias, coverage config
- `src/__tests__/setup.ts` — dummy env vars (so `config/env.ts` zod validation passes at import)
- `src/__tests__/helpers/fake-prisma.ts` — in-memory Prisma stub (create/update/updateMany/findUnique/findFirst/findMany/count/upsert/delete/deleteMany/$transaction + nested relation writes + unique-field registration)
- `src/__tests__/helpers/fake-gmail.ts` — canned gmail_v1.Gmail (send/get/insert/delete/threads.get) + makeFakeFetch
- `src/__tests__/helpers/test-context.ts` — vi.mock wiring for @coldjot/database, @/lib/google, @/lib/google/gmail/helper, @/lib/stats via vi.hoisted

---

## Resume guide

### Get back to a green state

```bash
cd "/Volumes/Data/00-My Projects/ColdJot/coldjot"
git checkout refactor/mailops-phase-0-tests

# Sanity check — all green:
npm test -w mailops                                   # 23 tests, 3 files, all pass
npx tsc --noEmit -p apps/mailops/tsconfig.json        # clean
```

### Recommended order for the remaining groups

Quickest wins first:

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

### The per-group test recipe

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

**Key assertions:**
- `wasCalledWith(ctx, "modelName", "op", { partialArgs })` — recorded prisma call matches a partial shape.
- `ctx.fake.stores.emailEvent.rows.values()` — read back rows written.
- `ctx.stats` — the `updateSequenceStats` vi.fn spy; `.toHaveBeenCalledWith(...)`.
- `ctx.fakeGmail.calls` — recorded Gmail transport ops.

**Mocking global `fetch`** (REST paths like PubSub):
```ts
const fakeFetch = vi.fn(async (input) => { /* route by URL */ });
vi.stubGlobal("fetch", fakeFetch);
beforeEach(() => { vi.stubGlobal("fetch", fakeFetch); fakeFetch.mockClear(); });
```

**Unique fields:** `findUnique({ where: { field } })` only resolves if `field` is registered. The fake auto-registers `id`/`hash`/`email`; other fields must be declared: `ctx.fake.seed("model", row, ["fieldName"])`.

### After each group

```bash
npm test -w mailops                                   # all tests pass
npx tsc --noEmit -p apps/mailops/tsconfig.json        # clean
git add -A && git commit -m "test(mailops): phase 0 — Group X <name> characterization (N cases)"
```

Update the [Group tracker](#group-tracker) above — flip the row to ✅, bump the totals.

### When all 15 groups are done

```bash
git checkout refactor/mailops
git merge --no-ff refactor/mailops-phase-0-tests -m "merge: phase 0 — characterization tests complete (all 15 groups)"
# Flip Phase 0 row to ✅ DONE in the At-a-glance table.
git checkout -b refactor/mailops-phase-1-seams
```

### Solved pitfalls (don't re-hit these)

1. **`vi.mock` + TDZ:** `test-context.ts` uses `vi.hoisted` for the holder because `vi.mock` factories are hoisted above imports. Don't import the fakes at the top of `test-context.ts` and reference them in the factory — use the holder pattern that's already there.
2. **Proxy-as-handler bug:** the fake prisma's model proxies must use a *plain handler object* (`makeModelHandler(model)`), not a Proxy as the handler arg. Already fixed.
3. **`vi.unstubAllGlobals()` in afterEach:** don't call it — it restores the real `fetch`, breaking subsequent tests. Re-stub in `beforeEach` instead.
4. **Unique fields:** `findUnique({ where: { threadId } })` only resolves if `threadId` was registered via `seed(model, row, ["threadId"])`. Auto-registered: `id`, `hash` (emailTracking), `email` (mailbox/emailWatch).
5. **`getClient` mutation leak:** when a test swaps `gmailClientService.getClient` to throw (401 cases), save + restore it in a `try/finally`.
6. **Unique-field cheatsheet:** `processedMessage`→`messageId`, `emailThread`→`threadId`, `sequenceStats`→`sequenceId`.

### What each remaining group needs

- **L (placeholders):** `lib/placeholders/index.ts` — `replacePlaceholders` + `validatePlaceholders`. Pure. No fakes.
- **M (email-subject):** `lib/email-subject.ts` — `determineEmailSubject`. Pure except it may call gmail for thread subject; mock `@/lib/google` (already mocked).
- **K (schedule-generator):** `lib/schedule/index.ts` — `ScheduleGenerator.calculateNextRun`. Use `vi.useFakeTimers()` with fixed dates for DST.
- **N (rate-limiter):** `lib/rate-limiter.ts` — `RateLimiter` (Redis-backed token bucket). Mock ioredis OR test the class with a fake Redis.
- **D (schedule-processor):** `services/jobs/schedule/processor.ts` — `ScheduleProcessor`. Needs a fake `JobManager` (record `addEmailJob` calls). Polls `SequenceContact.nextScheduledAt`.
- **H (list-sync):** `services/jobs/list/processor.ts` — `ListSyncProcessor`. Reuses prisma fake.
- **I (contact-processor):** `services/jobs/contact/processor.ts` — `ContactProcessor`. Reuses prisma fake.
- **J (gmail-client):** `lib/google/gmail/gmail.ts` — `GmailClientService` + `refreshTokenIfNeeded`. Mock `googleapis`.
- **O (watch-cleanup):** `services/watch/cleanup.ts` — `WatchCleanupService`. Reuses prisma fake.
- **E (sequence-controller):** `routes/sequence/controller.ts`. Install `supertest` + `@types/supertest` as devDeps. Mount just the sequence router on a minimal Express app.
- **F (mailbox-routes):** `routes/mailbox.ts`. Same supertest approach. Mock `WatchService`.
- **G (tracking-routes):** `routes/tracking/controller.ts`. supertest. The transparent-pixel Buffer, `X-Robots-Tag` header, Gmail-compose-view referer filtering, Googlebot UA filtering, safe-redirect check.

---

## Per-phase completion checklist

Every phase's "Definition of done" boils down to:

- [ ] `tsc --noEmit` clean across the monorepo.
- [ ] `npm run lint` clean (zero errors, zero warnings).
- [ ] **All** Phase 0 characterization tests pass unchanged.
- [ ] `server.ts` boots; HTTP contract to the web app unchanged.
- [ ] Commit(s) pushed on the phase's sub-branch; sub-branch merged into `refactor/mailops`.
- [ ] At-a-glance table + Phase 0 Group tracker updated.

## Final coverage requirement

At the end of Phase 7, every mailops feature has test coverage. Phase 0 characterizes current behavior (so the refactor provably changes nothing); Phase 7 replaces those with a permanent suite organized by layer. See [Phase 0 § Coverage matrix](./phase-0-characterization-tests.md#coverage-matrix) and [Phase 7 § Feature → test mapping](./phase-7-test-suite.md#feature--test-mapping).

## What does NOT change (true for every phase)

- The HTTP API contract — every endpoint, header, status code, response body.
- BullMQ queue topology, job names, retry/DLQ policy (plan 10's work).
- The Prisma schema — no migrations.
- The Gmail PubSub push contract (`/pubsub` JWT verification, response semantics).
- The tracking pixel / click-redirect contract.
- The web ↔ mailops auth boundary (`requireServiceToken`).

## Relationship to other plans

- **`plans/mailops-consolidation/`** — deliberately postponed. This refactor *enables* future consolidation but does not perform it.
- **`plans/refactor-plan/10` (BullMQ resilience)** — already done; untouched here.
- **`plans/refactor-plan/03` (service auth + CORS)** — already done; `requireServiceToken` middleware untouched.
- **`plans/testing/01-testing-baseline.md`** — picks Vitest; Phase 0 + Phase 7 reuse that choice.
