# Mailops Test Suite — Status

> **Single source of truth** for the test-suite plan's progress, branch layout, and how to resume. This plan is the refactor's Phase 7, lifted into its own area. The refactor's [`mailops-refactor/STATUS.md`](../mailops-refactor/STATUS.md) Phase 7 row points here and carries no Phase 7 detail.
>
> **Picking up mid-step?** Jump to [Resume guide](#resume-guide).
>
> **Legend:** ⬜ Not started · 🟡 In progress · 🟢 Partial (representative shipped, breadth remaining) · ✅ Done · ⏸️ Blocked/Deferred

## At-a-glance

| Step | Sub-plan | Status | Tests added | Commit(s) |
|---|---|---|---|---|
| **7.0** | [Domain service impls](./7.0-domain-service-impls.md) | ✅ **Done** | — (production code) | `74c8bdc`, `eee9eed` |
| 7.1 | [In-memory repository fakes](./7.1-repository-fakes.md) | ✅ **Done** | — (test infra) | `19ce1e3` |
| 7.2 | [Unit tests for domain services](./7.2-unit-domain-services.md) | ✅ **Done** | 24 (tracking + launch-sequence + run-schedule) + send-email(3) + inbox-sync(3) + watch(4) + gmail-client(3) | `8a9d0f4` + breadth |
| 7.3 | [Unit tests for pure helpers](./7.3-unit-pure-helpers.md) | ✅ **Done** | 46 (pixel, link-wrap, stats, placeholders, classify, states) + schedule(8) + email-subject(8) | `36aa055` + breadth |
| 7.4 | [Adapter tests](./7.4-adapter-tests.md) | ✅ **Done** | 17 (GmailTransport + GmailInboxSource, synthetic fixtures) + `scripts/record-gmail-fixtures.ts` upgrade path | `98b5b4f` + breadth |
| 7.5 | [Repository tests vs test DB](./7.5-repository-tests-db.md) | ✅ **Done** | 88 (all 20 `Prisma*Repository` classes) | `5056cad` + breadth |
| 7.6 | [Processor tests](./7.6-processor-tests.md) | ✅ **Done** | 4 (BaseProcessor.onFailed DLQ path; per-processor logic covered by Groups D/H/I) | `8a9ae48` |
| 7.7 | [End-to-end integration tests](./7.7-integration-tests.md) | ✅ **Done** | 121 (all 12 flows shipped) | `f160a0c` + breadth |
| 7.8 | [CI gate + coverage](./7.8-ci-gate.md) | ✅ **Done** | — (infra) | `0e8242f` |
| 7.9 | [Retire characterization tests](./7.9-retire-characterization.md) | ✅ **Done** | all 15 files retired (Groups A–O) | breadth |

**Test totals:** 159 fast-tier + 130 integration-tier = **289 tests, all green**. All 15 Phase-0 characterization files retired — every Group A–O is now covered by permanent unit/integration tests. The `lib/rate-limiter.ts` dead-code module was deleted alongside its characterization test.

**Estimated total:** 3–4 days of focused work. **Behavior change:** 7.0 is behavior-preserving; 7.1–7.8 are test-only; 7.9 deletes tests.

## Branch layout

```
refactor/mailops                    ← base; Phases 0–6 + Phase 7 foundation merged here
  └─ refactor/mailops-phase-7a-impls   (7.0 — merged)
  └─ refactor/mailops-phase-7-tests    (7.1–7.8 — merged at 833857b)
```

Both sub-branches are merged into `refactor/mailops`. Future Phase 7 breadth work (the remaining 7.2/7.3/7.4/7.5/7.6/7.7 tests + 7.9) branches off `refactor/mailops` as `refactor/mailops-phase-7-tests` (re-use the name) or a fresh `refactor/mailops-phase-7b-breadth`. Each step ends green: `tsc --noEmit` + ESLint (0 errors) + the fast tier pass; the integration tier passes when a test DB is available.

## What shipped (the foundation)

- **7.0** — `LaunchSequenceServiceImpl` + `RunScheduleServiceImpl` implemented + wired into the composition root (the impl gap the refactor left). Behavior-preserving; Group E + Group D characterization tests stayed green.
- **7.1** — Per-repo in-memory fakes implementing every `*Repository` interface + `FakeMailTransport`/`FakeInboxSource` (adapters) + `FakeJobManager`/`FakeRateLimitService` (infra stubs). Barrel at `__tests__/helpers/fakes/index.ts`.
- **7.8** — Two-tier test split (fast `test` / slow `test:integration`), turbo wiring, `.github/workflows/ci.yml` (fast job on push, integration job with Postgres service on PR), 80% line coverage threshold on the fast tier.

## What's partial (representative shipped, breadth remaining)

There are no 🟢 partial steps left — every step 7.0–7.9 is ✅ Done.

- **7.9 (done)** — all 15 characterization files retired. The final 6 (Groups E/F/H/I/N/O) each had their load-bearing assertions ported into a new permanent unit test FIRST, then the characterization file was deleted:
  - **Group E** → `unit/controllers/sequence.controller.test.ts` (14 cases: validator 400s, typed-error→status mapping, response bodies, happy paths).
  - **Group F** → `unit/controllers/mailbox.controller.test.ts` (8 cases: empty-body, Zod validation, mailbox-not-found, missing-token, stop-then-setup ordering, DELETE error).
  - **Group O** → `unit/services/watch-cleanup.service.test.ts` (3 cases: due-watch renewal, renew-fail→stopWatch, never-throws).
  - **Group H** → `unit/processors/list.processor.test.ts` (4 cases: processing→completed, failure→failed, sort-by-contact-count, empty-batch). Required constructor-injecting the repo into `ListSyncProcessor`.
  - **Group I** → `unit/processors/contact.processor.test.ts` (3 cases: dispatch currentStep=1, continue-on-error, empty no-op). Required constructor-injecting the repo into `ContactProcessor`.
  - **Group N** → `lib/rate-limiter.ts` was dead code (zero production callers); deleted the module + its characterization test together rather than writing a replacement.

## What shipped in the breadth pass

- **Phase A — testability refactors (behavior-preserving):** `determineEmailSubject` accepts injected repos; `applyClassification` takes `updateSequenceStats` as a dep; new `WatchGateway` + `TokenRefresher` adapter interfaces make `WatchService` constructor-injected. All 305 pre-existing tests stayed green through the refactor.
- **7.2 — domain service unit tests:** send-email (Group A), inbox-sync (Group C, incl. missing-mailbox/token-null/ProcessedMessage-dedupe), watch (Group F), gmail-client (Group J), tracking (Group B, incl. isFirstOpen + repeat-open-event-count). Constructor-injected fakes + targeted `vi.mock` for the irreducible helper seams.
- **7.3 — pure-helper unit tests:** schedule-generator (Group K, `calculateNextRun`), email-subject (Group M, with injected repos).
- **7.5 — all 20 `Prisma*Repository` classes** now have a test file. Shared `__tests__/helpers/seed.ts` FK-seed helpers; `ENCRYPTION_KEY` wired into `setup.ts` for the Mailbox Prisma extension.
- **7.7 — all 12 integration flows** shipped (was 9). Flows 10 (mailbox-watch) + 12 (token-refresh) landed after the `WatchGateway`/`TokenRefresher` extraction. The tracking-http flow now pins exact status/body/Location + the googleapis-referer + 500 error paths. Real services + real DB + faked Gmail.
- **7.9 (partial)** — 9 characterization files retired (Groups A/B/C/D/G/K/L/M/J). Each group's load-bearing assertions were ported into the permanent suite first.

## What's blocked / deferred

- **7.9 (remainder)** — 11 characterization files remain (Groups B/C/D/E/F/G/H/I/L/N/O). They stay as the safety net until each row in the [Feature → test mapping](./README.md#feature--test-mapping) is fully green. The highest-leverage next retirements: Group G (tracking-routes, already covered by `integration/tracking-http`) and Group C detail (pubsub-handler, covered by `integration/pubsub-classification` + the inbox-sync unit test).
- **7.4 recorded fixtures** — `scripts/record-gmail-fixtures.ts` is a documented one-time manual script (needs dev Gmail credentials). The existing synthetic adapter fixtures are correct; recorded fixtures are a quality upgrade, not a correctness gap.

## How to run

```bash
# Fast tier (no DB needed) — runs on every push:
npm test -w mailops                                   # 158 tests, <5s

# Integration tier (needs Postgres) — one-shot from repo root (boots Postgres,
# creates coldjot_test if absent, applies migrations, runs the tests):
npm run test:mailops:integration                      # 130 tests

# ...or step-by-step:
npm run db:up                                         # start postgres
npm run db:test:setup                                 # create + migrate coldjot_test (idempotent)
npm run test:integration -w mailops                   # 116 tests

# Override the test DB connection string if yours differs:
DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5432/coldjot_test \
  npm run test:integration -w mailops
```

The CI workflow (`.github/workflows/ci.yml`) provisions Postgres + runs migrations automatically on PRs.

## Resume guide

**Where we are: the plan is complete.** Every step 7.0–7.9 is ✅ Done. All 15 characterization files are retired; every Phase-0 Group A–O is covered by permanent unit/integration tests. `refactor/mailops` is ready to merge to `master`.

```bash
cd "/Volumes/Data/00-My Projects/ColdJot/coldjot"
git checkout refactor/mailops
npm test -w mailops                                    # 159 fast-tier tests passing
npm run test:integration -w mailops                    # 130 integration-tier tests passing (needs Postgres)
npx tsc --noEmit -p apps/mailops/tsconfig.json         # clean
npm run lint -w mailops                                # 0 errors
```

No remaining test-suite work. Optional future polish:
- **7.4 recorded fixtures** (optional) — run `scripts/record-gmail-fixtures.ts` once against dev Gmail; swap synthetic → recorded in the adapter test.
- **Merge** — `refactor/mailops-phase-7b-breadth` → `refactor/mailops` (`--no-ff`), then `refactor/mailops` → `master`.

## Definition of done (for the whole plan)

- [x] Every row in the [Feature → test mapping](./README.md#feature--test-mapping) has a passing permanent test.
- [x] Coverage targets met per the [README table](./README.md#coverage-targets-by-layer) (80% floor enforced by the CI gate).
- [x] All 12 integration flows pass (7.7).
- [x] `npm run test` runs in <30s without a DB.
- [x] CI runs `test` on push; `test:integration` on PRs; coverage gate enforced.
- [x] **Characterization tests deleted** (7.9) — all 15 retired (Groups A–O).
- [x] `tsc --noEmit` clean; ESLint clean (0 errors).
- [x] `refactor/mailops` ready to merge to `master`.

## Relationship to `plans/mailops-refactor/`

This plan **is** the refactor's Phase 7, lifted into its own folder. The refactor's [`STATUS.md`](../mailops-refactor/STATUS.md) At-a-glance row for Phase 7 points here and carries no Phase 7 detail. When this plan's Definition of done is met, `refactor/mailops` is ready to merge to `master`.

## Solved pitfalls (don't re-hit these)

1. **Integration files share one test DB** — `vitest.integration.config.ts` sets `fileParallelism: false` + `pool: "forks"` so a suite's truncate/seed isn't raced by another. Don't flip these back on.
2. **Enum values are lowercase** — `EmailEventEnum.SENT = "sent"` (not `"SENT"`); `EmailTrackingStatusEnum.OPENED = "opened"`. The schema stores lowercase; assert against the lowercase values.
3. **EmailTracking FK graph** — `userId` is a required FK (seed a `User`); `sequenceId`/`stepId`/`contactId` are nullable FKs but the `*Repository` interface types mark some required. Seed the parents you exercise (`User`/`Sequence`/`SequenceStep`/`Contact`) in `beforeAll`; cast `as CreatePendingInput` if you omit a required-but-nullable field.
4. **`DATABASE_URL_TEST` → `DATABASE_URL`** — `__tests__/setup.ts` maps `DATABASE_URL_TEST` into `DATABASE_URL` (which the real prisma client reads). The fast tier leaves `DATABASE_URL_TEST` unset → the dummy fallback applies → no real DB connection.
5. **`RunScheduleServiceImpl.processEmail` returns boolean** — `true` when enqueued, `false` for rate-limit/deleted-step no-ops, throws on failure (caught by `tick()`'s per-contact handler). `tick()` resolves with `{ enqueued }`; it does NOT reject on per-contact failures.
6. **Integration `beforeEach` truncates must be scoped** — files share one DB and run sequentially (not isolated). A blanket `prisma.contact.deleteMany()` trips FKs from rows other suites seeded; scope deletes by the suite's id prefix or `sequenceId` (`where: { sequenceId: SEQ_ID }`). Same for any aggregate another file might reference.
7. **`ENCRYPTION_KEY` is required for Mailbox writes** — `packages/database`'s Prisma extension encrypts `Mailbox.access_token` at rest via `ENCRYPTION_KEY`. `__tests__/setup.ts` sets a deterministic test key; if a repo test writes a real Mailbox row and you see "ENCRYPTION_KEY is not set", the setup file isn't loaded for that tier.
8. **Global poller queries see every suite's rows** — `findDueContacts` / `findNewContacts` query across ALL sequences, not just the test's own. When asserting on `tick()` outcomes, filter assertions by the suite's own `sequenceId`/`contactId` rather than asserting global counts (`enqueued === 1`), since another suite's ACTIVE sequence may contribute due contacts.
9. **`vi.mock` factories are hoisted** — declaring mock fns as top-level `const` then referencing them inside `vi.mock(...)` throws `Cannot access X before initialization`. Use `vi.hoisted(() => ({...}))` to declare the fns, then destructure them after the `vi.mock` call (see `integration/tracking-http.test.ts`).
