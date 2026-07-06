# Mailops Test Suite — the test plan you actually want

> **Status:** in progress — see [`STATUS.md`](./STATUS.md) for the at-a-glance table, what shipped vs. what's deferred, branch layout, run instructions, and resume guide. This README is the plan (why + test layout + coverage contract); STATUS.md tracks execution.
>
> **Goal:** now that the mailops refactor (Phases 0–6 in `plans/mailops-refactor/`) has everything injected and singleton-free, write the test suite that *should* exist — fast unit tests, adapter tests against recorded fixtures, repository tests against a real test DB, processor tests, and end-to-end integration tests. **At the end of this plan, every mailops feature has permanent test coverage** (see the [Feature → test mapping](#feature--test-mapping) below).
>
> **This is the implementation area for what the refactor tracked as "Phase 7".** It was lifted out of `plans/mailops-refactor/phase-7-test-suite.md` and split into per-step sub-plans (7.0–7.9) so each can be worked, reviewed, and merged on its own.

## Why this plan exists

The refactor's Phase 0 wrote **characterization** tests — blunt instruments that pin current behavior by mocking Prisma at the module boundary. They're slow-ish, somewhat fragile, and they don't test the *architecture* — they test that the old behavior survives.

After Phases 1–6, the codebase is testable the right way: services take repositories via constructor, repositories are interfaces, adapters are interfaces. Tests can inject fakes directly. This plan adds:

1. **Fast unit tests** per domain service — pure logic, no DB.
2. **Adapter tests** — record one real Gmail response, replay it forever.
3. **Repository tests** — Prisma impl against a real test database.
4. **Processor tests** — BullMQ `Job` in, assert domain service calls.
5. **End-to-end integration tests** covering every feature.
6. **CI gate** — tests run on every push; integration tests on every PR.

Phase 0's characterization tests (`apps/mailops/src/__tests__/characterization/`) are **deleted** in [7.9](./7.9-retire-characterization.md) once each row in the [Feature → test mapping](#feature--test-mapping) below has permanent coverage.

## Sub-plan index

> Detailed per-step status, test counts, and commit refs live in [`STATUS.md`](./STATUS.md). This table is the plan (what each step is + its dependencies); the Status column is a quick token only.

| Step | Sub-plan | Status | Effort | Depends on |
|---|---|---|---|---|
| **7.0** | [**Domain service impls (prerequisite)**](./7.0-domain-service-impls.md) | ✅ | 0.5 day | — |
| 7.1 | [In-memory repository fakes](./7.1-repository-fakes.md) | ✅ | 0.5 day | — |
| 7.2 | [Unit tests for domain services](./7.2-unit-domain-services.md) | 🟢 partial | 1 day | 7.0, 7.1 |
| 7.3 | [Unit tests for pure helpers](./7.3-unit-pure-helpers.md) | 🟢 partial | 0.5 day | — |
| 7.4 | [Adapter tests with recorded fixtures](./7.4-adapter-tests.md) | 🟢 partial | 0.5 day | 7.1 |
| 7.5 | [Repository tests against a real test DB](./7.5-repository-tests-db.md) | 🟢 partial | 0.5–1 day | — |
| 7.6 | [Processor tests](./7.6-processor-tests.md) | 🟢 partial | 0.5 day | 7.0, 7.1, 7.2 |
| 7.7 | [End-to-end integration tests (12 flows)](./7.7-integration-tests.md) | 🟢 partial | 1–1.5 days | 7.0, 7.1–7.6 |
| 7.8 | [CI gate + coverage enforcement](./7.8-ci-gate.md) | ✅ | 0.5 day | 7.1–7.7 |
| 7.9 | [Retire the characterization tests](./7.9-retire-characterization.md) | ⏸️ blocked | 0.25 day | every row in the mapping is green |

**Legend:** ✅ Done · 🟢 Partial (representative shipped, breadth remaining) · ⏸️ Blocked/Deferred. See [`STATUS.md`](./STATUS.md) for what each partial step still needs.

**Legend:** ⬜ Not started · 🟡 In progress · 🟢 Code done, awaiting verification · ✅ Done · ⏸️ Blocked/Deferred

> **What's shippable now:** the foundation (fakes, CI gate, coverage threshold, service unit tests, adapter tests, DB integration wiring) is in place and green. The remaining work is **breadth** — more unit/integration tests of the same shape — not new infrastructure. The characterization suite (98 tests) stays as the safety net until 7.9's coverage contract is fully met.

## Branch setup

```bash
cd "/Volumes/Data/00-My Projects/ColdJot/coldjot"
git checkout refactor/mailops                      # Phases 0–6 merged here

# 7.0 prerequisite: merge the domain-service impls first (if not already merged).
git merge --no-ff refactor/mailops-phase-7a-impls -m "merge: phase 7.0 — implement LaunchSequence + RunSchedule services"

npm test -w mailops                                # 16 files / 98 tests passing
npx tsc --noEmit -p apps/mailops/tsconfig.json     # clean
npm run lint -w mailops                            # 0 errors, 228 warnings

git checkout -b refactor/mailops-phase-7-tests     # hyphen scheme — matches all prior phases
```

> Each sub-plan is one commit (see its "Commit" section). Merge the branch back into
> `refactor/mailops` with `--no-ff` at the end, same as Phases 0–6.

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
│   └── prisma-*.test.ts                      against a real test DB (see 7.5)
├── processors/
│   ├── email.processor.test.ts
│   └── schedule.processor.test.ts
├── integration/
│   ├── send-and-track.test.ts                full send → open → click flow
│   ├── pubsub-reply.test.ts                  full PubSub push → REPLIED event
│   └── pubsub-bounce.test.ts                 full PubSub push → BOUNCED event
└── helpers/
    ├── fakes/                                in-memory repository impls (7.1)
    │   ├── email-tracking.fake.ts
    │   ├── email-event.fake.ts
    │   └── … one per repo …
    └── fixtures/
        └── gmail/                            canned Gmail API payloads
```

## Feature → test mapping

> **This is the authoritative coverage contract.** Every Phase 0 group (A–O) maps to one or more permanent tests in the new suite. **No characterization test is deleted until its row here is green.**

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

## Coverage targets by layer

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
- [ ] Coverage targets met per the table above.
- [ ] Adapter tests: `GmailTransport` + `GmailInboxSource` covered by recorded fixtures (no live Gmail in CI).
- [ ] Repository tests: every `Prisma*Repository` tested against the test DB.
- [ ] Integration tests: all 12 end-to-end flows pass.
- [ ] `npm run test` runs in <30s without a DB.
- [ ] CI runs `test` on every push; `test:integration` on PRs; coverage gate enforced.
- [ ] **Characterization tests (`__tests__/characterization/`) deleted** — every Group A–O confirmed covered by the permanent suite first.
- [ ] `tsc --noEmit` clean; ESLint clean.
- [ ] Sub-branch `refactor/mailops-phase-7-tests` merged into `refactor/mailops`; `refactor/mailops` ready to merge to `master`.

## Commit messages

- "phase 7.0: implement LaunchSequence + RunSchedule services" *(done — 7.2a + 7.2b on `refactor/mailops-phase-7a-impls`)*
- "phase 7.1: add in-memory repository fakes"
- "phase 7.2: unit tests for domain services"
- "phase 7.3: unit tests for pure helpers"
- "phase 7.4: adapter tests with recorded Gmail fixtures"
- "phase 7.5: repository tests against test DB"
- "phase 7.6: processor tests"
- "phase 7.7: end-to-end integration tests (12 flows)"
- "phase 7.8: CI test gate + coverage enforcement"
- "phase 7.9: retire characterization tests (after mapping confirmed)"

## Relationship to `plans/mailops-refactor/`

This plan **is** the refactor's Phase 7, lifted into its own folder so it can be worked on its own track. The refactor's [`STATUS.md`](../mailops-refactor/STATUS.md) At-a-glance row for Phase 7 points here. When this plan is done, `refactor/mailops` is ready to merge to `master`.

**Reusable harness from Phase 0:** the existing `apps/mailops/src/__tests__/helpers/{fake-prisma,fake-gmail,test-context}.ts` + `setup.ts` are the starting point. 7.1 refactors `fake-prisma.ts` into per-repo fakes; the in-memory patterns (and the solved-pitfall notes in STATUS.md) carry over.

**Implementation gap — now closed (7.0):** `services/domain/launch-sequence.service.ts` and `run-schedule.service.ts` were **interfaces only** at the end of the refactor (the composition root wired them to `notYetWired` placeholders). [7.0](./7.0-domain-service-impls.md) implemented both `*Impl` classes and wired them through — so 7.2 + 7.7 can now write their tests directly against the real services. ✅ done on branch `refactor/mailops-phase-7a-impls` (pending merge into `refactor/mailops`).

## Risks

| Risk | Mitigation |
|---|---|
| Recording Gmail fixtures requires live credentials | Use the dev Gmail account; run the recording script once locally; commit the JSON. CI never hits Gmail. |
| Repository tests are flaky (DB state leaks between tests) | Wrap each test in a transaction that rolls back, OR truncate in `beforeEach`. Don't rely on test ordering. |
| Integration tests are slow → developers skip running them | Keep them in a separate `test:integration` script. Fast `test` runs on every save; integration runs in CI only. |
| 80% coverage target feels arbitrary | It's a floor, not a ceiling. Focus coverage on the domains with the most logic (tracking, inbox-sync, send-email). Pure helpers should be ~100%. |
| ~~`LaunchSequence` / `RunSchedule` impls don't exist yet~~ | ✅ Resolved in [7.0](./7.0-domain-service-impls.md). The branch `refactor/mailops-phase-7a-impls` must be merged into `refactor/mailops` **before** branching `refactor/mailops-phase-7-tests` — otherwise the Phase 7 branch won't have the service impls to test. |
