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
| 7.2 | [Unit tests for domain services](./7.2-unit-domain-services.md) | 🟢 **Partial** | 24 (tracking + launch-sequence + run-schedule) | `8a9d0f4` |
| 7.3 | [Unit tests for pure helpers](./7.3-unit-pure-helpers.md) | 🟢 **Partial** | 46 (pixel, link-wrap, stats, placeholders, classify, states) | `36aa055` |
| 7.4 | [Adapter tests](./7.4-adapter-tests.md) | 🟢 **Partial** | 17 (GmailTransport + GmailInboxSource, synthetic fixtures) | `98b5b4f` |
| 7.5 | [Repository tests vs test DB](./7.5-repository-tests-db.md) | ✅ **Done** | 88 (all 20 `Prisma*Repository` classes) | `5056cad` + breadth |
| 7.6 | [Processor tests](./7.6-processor-tests.md) | ✅ **Done** | 4 (BaseProcessor.onFailed DLQ path; per-processor logic covered by Groups D/H/I) | `8a9ae48` |
| 7.7 | [End-to-end integration tests](./7.7-integration-tests.md) | 🟢 **Partial** | 116 (9 of 12 flows; mailbox-watch + token-refresh blocked on Gmail seam) | `f160a0c` + breadth |
| 7.8 | [CI gate + coverage](./7.8-ci-gate.md) | ✅ **Done** | — (infra) | `0e8242f` |
| 7.9 | [Retire characterization tests](./7.9-retire-characterization.md) | ⏸️ **Blocked** | — | — |

**Test totals:** 189 fast-tier + 116 integration-tier = **305 tests, all green**. The 98-test Phase 0 characterization suite remains as the safety net (deleted only in 7.9).

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

Each 🟢 step has a working, green representative that proves the pattern; the remaining work is more tests of the same shape.

- **7.2** — tracking / launch-sequence / run-schedule done. **Deferred:** send-email + inbox-sync unit tests (both have module-singleton seams — `lib/email/helper`, `lib/google/gmail/helper`, `lib/stats` — that Groups A/C already pin end-to-end; clean unit tests land when those seams are extracted).
- **7.3** — pixel, link-wrap, stats, placeholders, classify, states done. **Deferred:** email-subject (Group M) + schedule-generator (Group K) — both have module-singleton/file-IO entanglement; characterization already pins them.
- **7.4** — GmailTransport + GmailInboxSource with hand-built fixtures. **Deferred:** swap in real recorded fixtures from a one-time `scripts/record-gmail-fixtures.ts` run against dev Gmail (needs credentials). Assertion shapes stay identical.
- **7.7** — 9 of 12 flows shipped: send-and-track (full send → open → click chain), send-disabled, pubsub-classification (reply/bounce/original/dedupe/no-thread), pubsub-large-gap, sequence-lifecycle (launch/pause/resume/reset), schedule-tick (enqueue/rate-limit-skip/deleted-step), tracking-http (pixel/compose-skip/googlebot-skip/click-redirect/unsafe-block/event-validation via supertest). **Blocked:** mailbox-watch (flow 10) + token-refresh (flow 12) — both construct an OAuth2Client + google.gmail internally with no injection seam; they land when a `GmailClient` adapter seam is extracted (same prerequisite as 7.2's send-email/inbox-sync unit tests).

## What shipped in the breadth pass

- **7.5 — all 20 `Prisma*Repository` classes now have a test file** (was 1 representative; now 20). One file per repo under `__tests__/repositories/`, each seeding its FK graph via the shared `__tests__/helpers/seed.ts` helpers and truncating its own tables in `beforeEach`. Covers every interface method. Added `ENCRYPTION_KEY` to `__tests__/setup.ts` so the Mailbox Prisma extension (at-rest OAuth token encryption) works in the integration tier.
- **7.7 — 9 of 12 integration flows.** Real Prisma + real domain services + faked Gmail (FakeMailTransport / FakeInboxSource) + faked infra (FakeJobManager / FakeRateLimitService). The Gmail-touching module-singleton seams (`lib/email/helper`, `lib/google/gmail/helper`, `lib/tracking/link-wrap`, `lib/stats`) are mocked via `vi.mock` so the real service code paths run against the real DB without a Gmail client.

## What's blocked

- **7.7 flows 10 + 12 (mailbox-watch + token-refresh)** — `WatchService` constructs `new google.auth.OAuth2(...)` + `google.gmail(...)` internally and `refreshTokenIfNeeded` lives in `lib/google/gmail/helper`; neither has a constructor-injected Gmail-client seam. They become testable once a `GmailClient` adapter is extracted (the same prerequisite that unblocks 7.2's send-email/inbox-sync unit tests). The DB-only half of these flows (watch due-for-renewal, history purge, token persistence) is already covered by the 7.5 repo tests.
- **7.9** — Retire the characterization tests. Requires **every** row in the [Feature → test mapping](./README.md#feature--test-mapping) to be green in the permanent suite first. Do NOT delete any `__tests__/characterization/*.test.ts` file until its row is covered. Today the mapping is partially covered; the characterization suite (98 tests) stays as the safety net.

## How to run

```bash
# Fast tier (no DB needed) — runs on every push:
npm test -w mailops                                   # 189 tests, <5s

# Integration tier (needs Postgres):
docker compose up -d postgres                          # start the dev postgres
# create the test DB + run migrations (one-time):
docker exec coldjot-postgres-1 psql -U postgres -c "CREATE DATABASE coldjot_test;"
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/coldjot_test \
  npx prisma migrate deploy --schema packages/database/prisma/schema.prisma

DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5432/coldjot_test \
  npm run test:integration -w mailops                  # 10 tests
```

The CI workflow (`.github/workflows/ci.yml`) provisions Postgres + runs migrations automatically on PRs.

## Resume guide

**Where we are:** 7.0, 7.1, 7.5, 7.6, 7.8 are done; 7.7 has 9 of 12 flows. The remaining work is: extract the Gmail-client seam (unblocks 7.2 remainder + 7.7 flows 10/12 + makes 7.4's recorded fixtures reachable), then 7.9 once the Feature→test mapping is fully green.

```bash
cd "/Volumes/Data/00-My Projects/ColdJot/coldjot"
git checkout refactor/mailops
npm test -w mailops                                    # 189 fast-tier tests passing
npm run test:integration -w mailops                    # 116 integration-tier tests passing (needs Postgres)
npx tsc --noEmit -p apps/mailops/tsconfig.json         # clean
npm run lint -w mailops                                # 0 errors

git checkout -b refactor/mailops-phase-7c-gmail-seam   # branch off refactor/mailops tip
```

Highest-leverage next steps:
1. **Extract the Gmail-client seam** — wrap `new google.auth.OAuth2` + `google.gmail` behind an injectable adapter. Unblocks 7.2 send-email/inbox-sync unit tests, 7.7 flows 10 (mailbox-watch) + 12 (token-refresh), and makes 7.4's recorded fixtures reachable.
2. **7.2 remainder** — once the seam lands, write SendEmailServiceImpl + InboxSyncServiceImpl unit tests against `FakeMailTransport` / `FakeInboxSource`.
3. **7.9** — audit the [Feature → test mapping](./README.md#feature--test-mapping); delete each characterization file only once its row is green in the permanent suite.

## Definition of done (for the whole plan)

- [ ] Every row in the [Feature → test mapping](./README.md#feature--test-mapping) has a passing permanent test.
- [ ] Coverage targets met per the [README table](./README.md#coverage-targets-by-layer).
- [ ] All 12 integration flows pass (7.7).
- [ ] `npm run test` runs in <30s without a DB.
- [ ] CI runs `test` on push; `test:integration` on PRs; coverage gate enforced.
- [ ] **Characterization tests deleted** (7.9) — every Group A–O confirmed covered first.
- [ ] `tsc --noEmit` clean; ESLint clean (0 errors).
- [ ] `refactor/mailops` ready to merge to `master`.

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
