# Phase 7 — Tests, Round Two (the test suite you actually want)

> **Goal:** now that everything is injected and singleton-free, write the test suite that *should* exist — fast unit tests, adapter tests against recorded fixtures, repository tests against a real test DB, and end-to-end integration tests. **At the end of this phase, every mailops feature has permanent test coverage** (see Feature → test mapping below).
>
> **Sub-branch:** `refactor/mailops/phase-7-tests` (off `refactor/mailops` after Phase 6 merges)
> **Estimated effort:** 3–4 days (expanded for full coverage)
> **Behavior change:** zero (test-only).

## First step — branch setup

```bash
git checkout refactor/mailops
git checkout -b refactor/mailops/phase-7-tests
```

## Why this phase exists

Phase 0 wrote **characterization** tests — blunt instruments that pin current behavior by mocking Prisma at the module boundary. They're slow-ish, somewhat fragile, and they don't test the *architecture* — they test that the old behavior survives.

After Phases 1–6, the codebase is testable the right way: services take repositories via constructor, repositories are interfaces, adapters are interfaces. Tests can inject fakes directly. This phase adds:

1. **Fast unit tests** per domain service — pure logic, no DB.
2. **Adapter tests** — record one real Gmail response, replay it forever.
3. **Repository tests** — Prisma impl against a real test database.
4. **Processor tests** — BullMQ `Job` in, assert domain service calls.
5. **End-to-end integration tests** covering every feature.
6. **CI gate** — tests run on every push; integration tests on every PR.

Phase 0's characterization tests are **deleted** (Step 7.9) once each row in the Feature → test mapping below has permanent coverage.

## Test layout

```
apps/mailops/src/__tests__/
├── unit/
│   ├── services/
│   │   ├── tracking.service.test.ts          TrackingServiceImpl with fake repos
│   │   ├── send-email.service.test.ts        SendEmailServiceImpl with fake transport
│   │   ├── inbox-sync.service.test.ts        InboxSyncServiceImpl with fake InboxSource
│   │   ├── launch-sequence.service.test.ts
│   │   └── run-schedule.service.test.ts
│   ├── inbox-sync/
│   │   ├── classify.test.ts                  pure predicates
│   │   ├── states.test.ts                    status transitions
│   │   └── apply-classification.test.ts
│   ├── lib/
│   │   ├── pixel.test.ts                     pure
│   │   ├── link-wrap.test.ts                 pure
│   │   ├── stats.test.ts                     calculateRates pure
│   │   ├── email-subject.test.ts             pure
│   │   ├── placeholders.test.ts              pure
│   │   └── schedule.test.ts                  ScheduleGenerator with injected Clock
│   └── controllers/
│       └── sequence.controller.test.ts
├── adapters/
│   ├── gmail-transport.fixture.json          recorded Gmail send/get/insert/delete responses
│   ├── gmail-transport.test.ts               replays the fixture
│   └── gmail-inbox-source.test.ts            replays history.list + messages.get
├── repositories/
│   └── prisma-*.test.ts                      against a real test DB (see Repository tests)
├── processors/
│   ├── email.processor.test.ts
│   └── schedule.processor.test.ts
├── integration/
│   ├── send-and-track.test.ts                full send → open → click flow
│   ├── pubsub-reply.test.ts                  full PubSub push → REPLIED event
│   └── pubsub-bounce.test.ts                 full PubSub push → BOUNCED event
└── helpers/
    ├── fakes/                                in-memory repository impls
    │   ├── email-tracking.fake.ts
    │   ├── email-event.fake.ts
    │   └── … one per repo …
    └── fixtures/
        └── gmail/                            canned Gmail API payloads
```

## Step-by-step

### Step 7.1 — In-memory repository fakes

For each repository interface, write a fake that implements it with in-memory `Map`s. These are the test doubles for every unit test.

```ts
// helpers/fakes/email-tracking.fake.ts
export class FakeEmailTrackingRepository implements EmailTrackingRepository {
  private store = new Map<string, EmailTracking>();
  private byHash = new Map<string, string>();
  public calls: Array<{ method: string; args: any }> = [];

  async createPending(input) {
    const row = { id: randomUUID(), hash: input.hash, status: "pending", openCount: 0, ...input };
    this.store.set(row.id, row);
    this.byHash.set(row.hash, row.id);
    this.calls.push({ method: "createPending", args: input });
    return row;
  }
  async findByHash(hash) { /* … */ }
  async markSent(id, details, subject, seqId, contactId) { /* update store + push an OPENED event */ }
  // … etc …
}
```

Each fake records its calls (so tests can assert "markSent was called once with these args") and behaves like a real repository (so tests can seed state and read it back).

**Reuse:** the Phase 0 `fake-prisma.ts` becomes per-repo fakes; the logic moves but the in-memory patterns stay.

### Step 7.2 — Unit tests per domain service

For each of `TrackingServiceImpl`, `SendEmailServiceImpl`, `InboxSyncServiceImpl`, `LaunchSequenceServiceImpl`, `RunScheduleServiceImpl`:

- Construct the service with fake repos + a fake adapter (e.g. `FakeMailTransport` that records sends and returns canned ids).
- Test each public method's happy path + edge cases:
  - `TrackingServiceImpl.handleEmailOpen` — first open (creates OPENED event + updates stats), repeat open (increments openCount, no new event), unknown hash (no-op).
  - `SendEmailServiceImpl.send` — happy send, `disableSending` shortcut, transport throws 401 (re-thrown as `TOKEN_EXPIRED`).
  - `InboxSyncServiceImpl.handleNotification` — reply, bounce, original/no-op, already-processed.
  - `LaunchSequenceServiceImpl.launch` — sequence not found (404), no steps (400), no contacts (400), happy path (enqueues job + starts monitoring).
  - `RunScheduleServiceImpl.tick` — N due contacts → N email jobs enqueued with correct delays.

These tests are **fast** (<100ms each) because no DB, no BullMQ, no real Gmail.

### Step 7.3 — Unit tests for pure helpers

`pixel.ts`, `link-wrap.ts`, `stats.ts` (calculateRates), `email-subject.ts`, `placeholders.ts`, `classify.ts`, `states.ts`, `apply-classification.ts`. These have no dependencies — straightforward input → output tests.

For `calculateRates`, port the assertions from Phase 0's rate-math canary so the math stays pinned.

### Step 7.4 — Adapter tests with recorded fixtures

Record one real Gmail API response per operation (send, get, insert, delete, history.list, messages.get) into a JSON fixture. The test replays the fixture against `GmailTransport` / `GmailInboxSource`.

```ts
// adapters/gmail-transport.test.ts
import { GmailTransport } from "@/adapters/gmail-transport";
import { fakeGmailClient } from "../helpers/fakes/gmail-client";
import sendResponse from "./gmail-transport.fixture.json";

describe("GmailTransport", () => {
  it("send returns the assigned id and threadId", async () => {
    const gmail = fakeGmailClient({ send: sendResponse });
    const transport = new GmailTransport(() => gmail);
    const result = await transport.send({ userId: "me", raw: "abc", threadId: "t1" });
    expect(result).toEqual({ id: sendResponse.id, threadId: sendResponse.threadId });
  });
});
```

To record: write a one-time script (`scripts/record-gmail-fixtures.ts`) that hits the real Gmail API with a test account and dumps the JSON. Run it once manually; commit the JSON. **Never** hit real Gmail from CI.

### Step 7.5 — Repository tests against a real test DB

These are the slowest tests — they need a database. Run them only in CI (or locally with `docker compose up test-db`).

Setup:
- A dedicated test database (separate from dev). Connection string in `DATABASE_URL_TEST`.
- A `beforeEach` that truncates all tables (or wraps each test in a transaction that rolls back).

For each `Prisma*Repository`, test that each method writes/reads correctly:
- `PrismaEmailTrackingRepository.createPending` → row in DB with the right fields.
- `markSent` → row updated + OPENED event created (the nested write).
- etc.

These are the only tests that catch Prisma-specific bugs (typos in field names, missing `include`, wrong relation).

### Step 7.6 — Processor tests

For each `*Processor`, construct it with fake repos + a fake `JobManager`. Feed a BullMQ `Job` (constructed with `{ id: "job-1", data: emailJobData }` — no real BullMQ worker needed). Assert the right domain-service calls fire.

These verify the *glue* between BullMQ and the domain — they're thin tests because the logic lives in the services (covered by 7.2).

### Step 7.7 — End-to-end integration tests

Each test wires real Prisma (against the test DB) + faked Gmail + real domain services. They're the canary for "did we wire everything end-to-end correctly?". Expand beyond the original 3 to cover every end-to-end flow:

1. **`send-and-track.test.ts`** — create a Sequence + Contact + Step → enqueue EmailJob → run EmailProcessor once → assert EmailTracking (status SENT), EmailEvent (SENT), SequenceStats bumped, EmailThread created. Then call `tracking.handleEmailOpen(hash)` → assert OPENED event + stats. Then `handleLinkClick` → assert CLICKED.
2. **`send-disabled.test.ts`** — `disableSending = true` → fake IDs, no Gmail calls, tracking + event still written.
3. **`pubsub-reply.test.ts`** — seed an EmailThread + SequenceContact → push a canned PubSub message (reply classification) through `InboxSyncService.handleNotification` → assert REPLIED event + SequenceContact status change + stats.
4. **`pubsub-bounce.test.ts`** — same shape, bounce classification.
5. **`pubsub-original.test.ts`** — message from own mailbox → no event, no contact change.
6. **`pubsub-already-processed.test.ts`** — replay same notification → skip.
7. **`pubsub-large-gap.test.ts`** — huge history gap → HISTORY_GAP record, watch historyId updated, no message processing.
8. **`sequence-lifecycle.test.ts`** — launch (default business hours created, job enqueued, monitoring started) → pause → resume → reset (rate limits cleared, status → draft).
9. **`schedule-tick.test.ts`** — seed due contacts → run `RunScheduleServiceImpl.tick()` → assert N email jobs enqueued with correct business-hours-aware delays.
10. **`mailbox-watch.test.ts`** — setup watch → assert WatchService called → teardown → stopped.
11. **`tracking-http.test.ts`** — pixel served with headers; Gmail compose view + Googlebot skipped; click redirect; unsafe redirect blocked; invalid event type rejected. (Uses supertest against the real Express router.)
12. **`token-refresh.test.ts`** — Gmail OAuth token expiry mid-flow → refresh called, new token persisted, flow completes.

### Step 7.8 — CI gate

- `apps/mailops/package.json`: split scripts:
  - `"test"` — unit + adapters + processors (fast, no DB).
  - `"test:integration"` — repository + integration tests (slow, needs DB).
- Root `turbo.json`: add `test` task; CI runs `npm run test` on every push, `npm run test:integration` on PRs.
- Add a GitHub Action (or extend the existing one) that boots a Postgres service container, runs Prisma migrations against it, then runs `test:integration`.
- **Coverage gate:** add `vitest --coverage` to CI. Fail if any file under `apps/mailops/src/{services,lib,controllers,adapters,repositories}` drops below 80% line coverage. Pure helpers (`pixel.ts`, `link-wrap.ts`, `stats.ts`, `placeholders.ts`, `email-subject.ts`, `schedule/*`) target 100%.

### Step 7.9 — Retire the characterization tests — DECIDED: delete

The `__tests__/characterization/` directory is **deleted** once the Feature → test mapping below confirms every Phase 0 row has permanent coverage in the new suite.

Process:
1. For each of the 15 characterization files (Groups A–O), walk the Feature → test mapping and confirm the permanent test exists and passes.
2. Delete the characterization file.
3. If any row is *not* yet covered by a permanent test, **do not delete that characterization file** — write the permanent test first, then delete.

## Feature → test mapping

This is the authoritative coverage contract. Every Phase 0 group (A–O) maps to one or more permanent tests in the new suite. **No characterization test is deleted until its row here is green.**

| Phase 0 group | Feature | Permanent test(s) | Type |
|---|---|---|---|
| A | Email send (Gmail) | `unit/services/send-email.service.test.ts` + `integration/send-and-track.test.ts` + `integration/send-disabled.test.ts` | unit + integration |
| B | Tracking open/click/event + rate math | `unit/services/tracking.service.test.ts` + `unit/lib/stats.test.ts` + `integration/send-and-track.test.ts` | unit + integration |
| C | PubSub inbox sync (reply/bounce/original/processed/gap) | `unit/services/inbox-sync.service.test.ts` + `integration/pubsub-*.test.ts` (5 files) | unit + integration |
| D | Schedule tick | `unit/services/run-schedule.service.test.ts` + `integration/schedule-tick.test.ts` | unit + integration |
| E | Sequence lifecycle | `unit/controllers/sequence.controller.test.ts` + `integration/sequence-lifecycle.test.ts` | unit + integration |
| F | Mailbox watch | `integration/mailbox-watch.test.ts` | integration |
| G | Tracking pixel + click HTTP | `integration/tracking-http.test.ts` (supertest) | integration |
| H | List sync | `unit/processors/list.processor.test.ts` | unit |
| I | Contact sync | `unit/processors/contact.processor.test.ts` | unit |
| J | Gmail OAuth client + token refresh | `unit/adapters/gmail-transport.test.ts` + `unit/adapters/gmail-inbox-source.test.ts` + `integration/token-refresh.test.ts` | unit + integration |
| K | Schedule generator (DST/business hours) | `unit/lib/schedule.test.ts` (with fake Clock) | unit |
| L | Placeholders | `unit/lib/placeholders.test.ts` | unit |
| M | Email subject resolution | `unit/lib/email-subject.test.ts` | unit |
| N | Rate limiter | `unit/lib/rate-limiter.test.ts` (with ioredis fake) | unit |
| O | Watch cleanup | `unit/services/watch-cleanup.test.ts` | unit |

**Coverage targets by layer:**

| Layer | Target | Why |
|---|---|---|
| `services/domain/*` | 90%+ | the core business logic |
| `services/inbox-sync/*` | 90%+ | classification rules are subtle |
| `lib/{pixel,link-wrap,stats,placeholders,email-subject}.ts` | 100% | pure functions, easy to fully cover |
| `lib/schedule/*` | 90%+ | DST/business-hours edge cases matter |
| `adapters/*` | 85%+ | via recorded fixtures |
| `repositories/prisma/*` | 80%+ | against test DB |
| `controllers/*` | 85%+ | request shaping + service calls |
| `services/jobs/*` (processors) | 75%+ | thin glue; logic is in services |
| `routes/*` | 60%+ | very thin; covered indirectly by integration tests |

## Definition of done

- [ ] `apps/mailops/src/__tests__/` has the structure above (unit / adapters / repositories / processors / integration / helpers).
- [ ] **Every row in the Feature → test mapping has a passing permanent test.** This is the hard requirement — no feature ships without coverage.
- [ ] Coverage targets met per the table: `services/domain/` 90%+, `services/inbox-sync/` 90%+, pure helpers 100%, `lib/schedule/` 90%+, adapters 85%+, repos 80%+, controllers 85%+, processors 75%+.
- [ ] Adapter tests: `GmailTransport` + `GmailInboxSource` covered by recorded fixtures (no live Gmail in CI).
- [ ] Repository tests: every `Prisma*Repository` tested against the test DB.
- [ ] Integration tests: all 12 end-to-end flows pass.
- [ ] `npm run test` runs in <30s without a DB.
- [ ] CI runs `test` on every push; `test:integration` on PRs; coverage gate enforced.
- [ ] **Characterization tests (`__tests__/characterization/`) deleted** — every Group A–O confirmed covered by the permanent suite first.
- [ ] `tsc --noEmit` clean; ESLint clean.
- [ ] Sub-branch `refactor/mailops/phase-7-tests` merged into `refactor/mailops`; `refactor/mailops` ready to merge to `master`.

## What to commit

- "phase 7.1: add in-memory repository fakes"
- "phase 7.2: unit tests for domain services"
- "phase 7.3: unit tests for pure helpers"
- "phase 7.4: adapter tests with recorded Gmail fixtures"
- "phase 7.5: repository tests against test DB"
- "phase 7.6: processor tests"
- "phase 7.7: end-to-end integration tests (12 flows)"
- "phase 7.8: CI test gate + coverage enforcement"
- "phase 7.9: retire characterization tests (after mapping confirmed)"

## Risks

| Risk | Mitigation |
|---|---|
| Recording Gmail fixtures requires live credentials | Use the dev Gmail account; run the recording script once locally; commit the JSON. CI never hits Gmail. |
| Repository tests are flaky (DB state leaks between tests) | Wrap each test in a transaction that rolls back, OR truncate in `beforeEach`. Don't rely on test ordering. |
| Integration tests are slow → developers skip running them | Keep them in a separate `test:integration` script. Fast `test` runs on every save; integration runs in CI only. |
| 80% coverage target feels arbitrary | It's a floor, not a ceiling. Focus coverage on the domains with the most logic (tracking, inbox-sync, send-email). Pure helpers should be ~100%. |
