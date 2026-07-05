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
| 7.5 | [Repository tests vs test DB](./7.5-repository-tests-db.md) | 🟢 **Partial** | 7 (EmailTracking representative) | `5056cad` |
| 7.6 | [Processor tests](./7.6-processor-tests.md) | 🟢 **Partial** | 4 (BaseProcessor.onFailed DLQ path) | `8a9ae48` |
| 7.7 | [End-to-end integration tests](./7.7-integration-tests.md) | 🟢 **Partial** | 3 (TrackingServiceImpl-vs-DB canary) | `f160a0c` |
| 7.8 | [CI gate + coverage](./7.8-ci-gate.md) | ✅ **Done** | — (infra) | `0e8242f` |
| 7.9 | [Retire characterization tests](./7.9-retire-characterization.md) | ⏸️ **Blocked** | — | — |

**Test totals:** 189 fast-tier + 10 integration-tier, all green. The 98-test Phase 0 characterization suite remains as the safety net (deleted only in 7.9).

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
- **7.5** — EmailTracking repo test vs real Postgres (7 cases) + test-DB wiring proven. **Deferred:** 19 more `Prisma*Repository` test files (copy the EmailTracking template; seed the FK graph per aggregate).
- **7.6** — `BaseProcessor.onFailed` DLQ path (the Phase-0 gap). The individual processors (schedule/contact/list) stay covered by Groups D/H/I; EmailProcessor is an orchestrator over the already-tested services.
- **7.7** — TrackingServiceImpl-vs-DB integration canary (3 cases) + sequential-execution isolation (`fileParallelism: false` — all integration files share one test DB). **Deferred:** 11 more flows (send-and-track, pubsub-*, sequence-lifecycle, schedule-tick, mailbox-watch, tracking-http, token-refresh). Several need faked Gmail (`FakeMailTransport`) or supertest (tracking-http).

## What's blocked

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

**Where we are:** the foundation (7.0, 7.1, 7.8) is done and merged. The breadth work (more 7.2/7.3/7.4/7.5/7.6/7.7 tests) is next; 7.9 stays blocked until the Feature→test mapping is fully green.

```bash
cd "/Volumes/Data/00-My Projects/ColdJot/coldjot"
git checkout refactor/mailops
npm test -w mailops                                    # 189 fast-tier tests passing
npx tsc --noEmit -p apps/mailops/tsconfig.json         # clean
npm run lint -w mailops                                # 0 errors

git checkout -b refactor/mailops-phase-7b-breadth      # branch off refactor/mailops tip
```

Then pick a 🟢 step from the At-a-glance table above and add tests of the shape its sub-plan describes. Highest-leverage next steps:
1. **7.5 breadth** — 19 repo test files, each a copy of the EmailTracking template (mechanical, high coverage gain).
2. **7.7 flows** — the send-and-track canary (use `FakeMailTransport` + real repos) is the highest-value integration test.
3. **7.2 remainder** — extract the send-email/inbox-sync module-singleton seams, then write their unit tests.

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
