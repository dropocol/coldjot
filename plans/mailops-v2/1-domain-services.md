# 1 — Remaining domain services

> **Goal:** convert the other 4 domain services to `db: Db` + extension methods,
> and move their unit tests to the integration tier.
>
> **Status:** ⬜ Not started · 🟡 In progress · ✅ Done — _(update STATUS.md when you flip this)_

## Prerequisite

Sub-plan 0 complete — `Db` exported, `domainExtension` created, the pattern
established.

## Services to convert

| Service | Repo deps today | Extension methods to add |
|---|---|---|
| `inbox-sync` | mailbox, emailWatch, emailWatchHistory, processedMessage, emailThread, sequenceContact, emailEvent + `InboxSource` adapter | mailbox.*, emailWatch.*, emailWatchHistory.*, processedMessage.*, emailThread.*, sequenceContact.*, emailEvent.* |
| `run-schedule` | sequenceContact, sequenceStep + JobManager, RateLimitService, ScheduleGenerator | sequenceContact.*, sequenceStep.* |
| `send-email` | emailTracking, trackedLink + `MailTransport` adapter | emailTracking.*, trackedLink.* |
| `tracking` | emailTracking, emailEvent | emailTracking.*, emailEvent.* (note: uses `$transaction` — see below) |

**Keep non-repo deps injected:** `InboxSource` (inbox-sync), `MailTransport`
(send-email), `JobManager`, `RateLimitService`, `ScheduleGenerator`,
`MonitoringService`. These are adapters/infra, not repos.

## Per-service workflow

For each service:

1. **Add methods to `domain-extension.ts`** — for each repo method the service
   calls, add a corresponding extension method under `model.X`. Copy the body
   verbatim from `prisma/prisma-X.repo.ts`, replacing `prisma.X` with
   `Prisma.getExtensionContext(this)`.

2. **Move record types to `@coldjot/types`** — any `XRecord` / `XInput` /
   `XGraph` type the service imports from a `*.repo.ts` file goes to
   `@coldjot/types/src/<domain>.ts`. (See [plan.md §6 record-type table](./plan.md#6-record-type-home)
   for the full list.)

3. **Rebuild packages:** `npm run build -w @coldjot/types && npm run build -w @coldjot/database`.

4. **Swap call sites in the service:** `this.xRepo.method(...)` → `this.db.x.method(...)`.
   Replace repo deps in the constructor with `db: Db`.

5. **Update composition-root wiring:** pass `prisma` instead of repo instances.

6. **Move the unit test → integration:** construct with real `prisma`, seed via
   `__tests__/helpers/seed.ts`, scope cleanup by id prefix. (If the existing
   integration test already covers the cases — as launch-sequence did — merge
   the missing cases in and delete the unit test.)

### `inbox-sync.service.ts`

- **7 repo deps → `db: Db` + `inboxSource: InboxSource`.**
- Add extension methods for: `mailbox`, `emailWatch`, `emailWatchHistory`,
  `processedMessage`, `emailThread`, `sequenceContact`, `emailEvent`.
- Move record types: `MailboxWithAliasesRecord`, `EmailWatchRecord`,
  `EmailThreadRecord`, `ProcessedMessageRecord`, `SequenceContactRecord`,
  `EmailEventRecord`, etc. (see plan.md table).

### `run-schedule.service.ts`

- **2 repo deps → `db: Db`.** Keep `jobManager`, `rateLimitService`, `scheduleGen`.
- Add extension methods for: `sequenceContact` (the big one — `findDueContacts`,
  `findNewContacts`, status updates), `sequenceStep`.
- Move record types: `SequenceContactRecord`, `DueContactGraph`,
  `NewContactGraph`, `UpdateStatusInput`, `SequenceStepRecord`.

### `send-email.service.ts`

- **2 repo deps → `db: Db` + `transport: MailTransport`.**
- **Retire the dead default-param pattern** while you're here:
  ```diff
  -constructor(
  -  private readonly transport: MailTransport = new GmailTransport(),
  -  private readonly emailTracking: EmailTrackingRepository = new PrismaEmailTrackingRepository(),
  -  private readonly trackedLink: TrackedLinkRepository = new PrismaTrackedLinkRepository()
  -) {}
  +constructor(
  +  private readonly db: Db,
  +  private readonly transport: MailTransport,
  +) {}
  ```
- Add extension methods for: `emailTracking`, `trackedLink`.

### `tracking.service.ts`

- **2 repo deps → `db: Db`.**
- **Keep the `$transaction`** — type the callback explicitly as
  `Prisma.TransactionClient`. Extension methods are NOT available on the `tx`
  client; if you need them inside the transaction, inline raw Prisma there
  (which is what the code already does).
- Add extension methods for: `emailTracking`, `emailEvent`.
- Retire the dead default-param pattern (same as send-email).

## Tests — move unit → integration

For each service, move `src/__tests__/unit/services/<svc>.service.test.ts` →
`src/__tests__/integration/<svc>.service.test.ts`:

| Before | After |
|---|---|
| Construct with `FakeXRepository` | Construct with real `prisma` |
| Seed `fake.store.set(id, {...})` | Seed via `__tests__/helpers/seed.ts` |
| Assert on fake state | Query `prisma` and assert |
| `FakeJobManager` / `FakeRateLimitService` | **Keep** (infra stubs, not repos) |
| `vi.mock` for irreducible seams | **Keep** |

**Check first whether an integration test already exists** for the service
(like `sequence-lifecycle.test.ts` did for launch-sequence). If so, merge the
missing unit-test cases into it and delete the unit test. If not, create the
integration test fresh.

**Scope cleanup per suite** — use a unique id prefix (`inbox-sync-`,
`run-sched-`, etc.) and `deleteMany({ where: { id: { startsWith: prefix } } })`
in `beforeEach`. Don't blanket-delete (shared DB — see
[STATUS.md pitfall #9](./STATUS.md#solved-pitfalls-dont-re-hit-these)).

## Files touched (indicative)

- `packages/database/src/domain-extension.ts` — add ~25 methods across 7 models
- `packages/types/src/*.ts` — add ~15 record types
- `apps/mailops/src/services/domain/{inbox-sync,run-schedule,send-email,tracking}.service.ts` — convert
- `apps/mailops/src/composition-root.ts` — wire each with `prisma`
- `apps/mailops/src/__tests__/integration/*.test.ts` — new/moved tests
- `apps/mailops/src/__tests__/unit/services/{inbox-sync,run-schedule,send-email,tracking}.service.test.ts` — delete (if integration covers)

## Definition of done

- [ ] All 4 services take `db: Db`; no repo deps in their constructors.
- [ ] `send-email` + `tracking` dead default-params retired.
- [ ] All extension methods added to `domain-extension.ts`; packages rebuilt.
- [ ] All record types moved to `@coldjot/types`.
- [ ] Composition root wires all 4 with `prisma`.
- [ ] Tests moved/merged to integration; passing against Postgres.
- [ ] `npm run typecheck -w mailops` clean.
- [ ] `npm run test -w mailops` green (fast tier).
- [ ] `npm run test:integration -w mailops` green.
- [ ] [STATUS.md](./STATUS.md) domain-services rows → ✅.
