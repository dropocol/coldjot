# Phase 7 — Tests, Round Two (the test suite you actually want)

> **Goal:** now that everything is injected and singleton-free, write the test suite that *should* exist — fast unit tests, adapter tests against recorded fixtures, and a small number of end-to-end integration tests.
>
> **Branch:** `refactor/mailops-phase7` (off Phase 6 branch)
> **Estimated effort:** 2–3 days
> **Behavior change:** zero (test-only).

## Why this phase exists

Phase 0 wrote **characterization** tests — blunt instruments that pin current behavior by mocking Prisma at the module boundary. They're slow-ish, somewhat fragile, and they don't test the *architecture* — they test that the old behavior survives.

After Phases 1–6, the codebase is testable the right way: services take repositories via constructor, repositories are interfaces, adapters are interfaces. Tests can inject fakes directly. This phase adds:

1. **Fast unit tests** per domain service — pure logic, no DB.
2. **Adapter tests** — record one real Gmail response, replay it forever.
3. **Repository tests** — Prisma impl against a real test database.
4. **Processor tests** — BullMQ `Job` in, assert domain service calls.
5. **One happy-path integration test per phase-4 split** — wires real Prisma + faked Gmail end-to-end.
6. **CI gate** — tests run on every push.

Phase 0's characterization tests can be **deleted** once their target logic is covered by the new suite — or kept as additional integration coverage if they still pass without module mocking.

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

Three tests, each wiring real Prisma (against the test DB) + faked Gmail + real domain services:

1. **`send-and-track.test.ts`** — create a Sequence + Contact + Step → enqueue EmailJob → run EmailProcessor once → assert EmailTracking (status SENT), EmailEvent (SENT), SequenceStats bumped, EmailThread created. Then call `tracking.handleEmailOpen(hash)` → assert OPENED event + stats. Then `handleLinkClick` → assert CLICKED.

2. **`pubsub-reply.test.ts`** — seed an EmailThread + SequenceContact → push a canned PubSub message (reply classification) through `InboxSyncService.handleNotification` → assert REPLIED event + SequenceContact status change + stats.

3. **`pubsub-bounce.test.ts`** — same shape, bounce classification.

These three are the canary for "did we wire everything end-to-end correctly?".

### Step 7.8 — CI gate

- `apps/mailops/package.json`: split scripts:
  - `"test"` — unit + adapters + processors (fast, no DB).
  - `"test:integration"` — repository + integration tests (slow, needs DB).
- Root `turbo.json`: add `test` task; CI runs `npm run test` on every push, `npm run test:integration` on PRs.
- Add a GitHub Action (or extend the existing one) that boots a Postgres service container, runs Prisma migrations against it, then runs `test:integration`.

### Step 7.9 — Retire the characterization tests

Once 7.2–7.7 cover the same behavior, the `__tests__/characterization/` directory is redundant. Either:
- **Delete it** — the new suite is better structured and faster.
- **Keep it as additional integration coverage** — if its tests still pass without module mocking (they should, after Phase 3's rewiring).

**Recommend delete** — duplicate coverage is maintenance burden. The new suite's assertions are stronger.

## Definition of done

- [ ] `apps/mailops/src/__tests__/` has the structure above.
- [ ] Unit tests: ≥ 80% line coverage on `services/domain/`, `services/inbox-sync/`, `lib/tracking/{pixel,link-wrap,stats}.ts`.
- [ ] Adapter tests: `GmailTransport` + `GmailInboxSource` covered by recorded fixtures.
- [ ] Repository tests: every `Prisma*Repository` tested against the test DB.
- [ ] Integration tests: 3 end-to-end tests pass.
- [ ] `npm run test` runs in <30s without a DB.
- [ ] CI runs `test` on every push; `test:integration` on PRs.
- [ ] Characterization tests deleted (or explicitly kept with a comment explaining why).
- [ ] `tsc --noEmit` clean; ESLint clean.

## What to commit

- "phase 7.1: add in-memory repository fakes"
- "phase 7.2: unit tests for domain services"
- "phase 7.3: unit tests for pure helpers"
- "phase 7.4: adapter tests with recorded Gmail fixtures"
- "phase 7.5: repository tests against test DB"
- "phase 7.6: processor tests"
- "phase 7.7: end-to-end integration tests"
- "phase 7.8: CI test gate"
- "phase 7.9: retire characterization tests"

## Risks

| Risk | Mitigation |
|---|---|
| Recording Gmail fixtures requires live credentials | Use the dev Gmail account; run the recording script once locally; commit the JSON. CI never hits Gmail. |
| Repository tests are flaky (DB state leaks between tests) | Wrap each test in a transaction that rolls back, OR truncate in `beforeEach`. Don't rely on test ordering. |
| Integration tests are slow → developers skip running them | Keep them in a separate `test:integration` script. Fast `test` runs on every save; integration runs in CI only. |
| 80% coverage target feels arbitrary | It's a floor, not a ceiling. Focus coverage on the domains with the most logic (tracking, inbox-sync, send-email). Pure helpers should be ~100%. |
