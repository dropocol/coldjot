# Mailops Refactor — Status

> Sub-plan tracker. Update this as each phase ships. Detailed step-by-step in each phase doc.
>
> **Legend:** ⬜ Not started · 🟡 In progress · 🟢 Code done, awaiting verification · ✅ Done · ⏸️ Blocked/Deferred

## At-a-glance

| Phase | Doc | Status | Branch | Effort |
|---|---|---|---|---|
| 0 | [characterization tests](./phase-0-characterization-tests.md) | ⬜ Not started | `refactor/mailops-phase0` | 1–2 days |
| 1 | [seams + composition root](./phase-1-seams-composition-root.md) | ⬜ Not started | `refactor/mailops-phase1` | 2–3 days |
| 2 | [routes → controllers](./phase-2-routes-to-controllers.md) | ⬜ Not started | `refactor/mailops-phase2` | 1 day |
| 3 | [repositories isolate Prisma](./phase-3-repositories.md) | ⬜ Not started | `refactor/mailops-phase3` | 3–4 days |
| 4 | [split three god-objects](./phase-4-split-god-objects.md) | ⬜ Not started | `refactor/mailops-phase4` | 5–7 days |
| 5 | [dead code cleanup](./phase-5-dead-code-cleanup.md) | ⬜ Not started | `refactor/mailops-phase5` | 0.5–1 day |
| 6 | [kill ServiceManager singleton](./phase-6-kill-service-manager.md) | ⬜ Not started | `refactor/mailops-phase6` | 2 days |
| 7 | [real test suite](./phase-7-test-suite.md) | ⬜ Not started | `refactor/mailops-phase7` | 2–3 days |

**Estimated total:** ~17–23 days of focused work. Each phase is independently shippable.

## Sequencing rules

- **Phases must ship in order.** Each builds on interfaces / migrations from the previous.
  - Exception: Phase 5 (cleanup) can run in parallel with Phase 6 if needed — they touch different files.
- **Each phase ends green:** `tsc --noEmit` + ESLint + Phase 0 characterization tests all pass.
- **One commit per step** within a phase (each phase doc specifies the commits).
- **The SMTP decision (Phase 4b)** needs your sign-off before 4b starts: delete the dead branch (default) or resurrect it behind `MailTransport`.

## Open decisions (resolve before the relevant phase starts)

| # | Decision | Where | Default |
|---|---|---|---|
| 1 | SMTP path: delete dead code or resurrect as real fallback? | Phase 4b step "SMTP decision" | **Delete** (recommend) |
| 2 | Dormant `ThreadProcessor` (846 lines): delete or absorb as `PollingInboxSource`? | Phase 4c.7 | **Delete** (recommend) |
| 3 | `RedisConnection` + `MemoryMonitor`: keep as process-wide singletons or convert to plain classes? | Phase 6.6 | Keep singletons (recommend) |
| 4 | Phase 0 characterization tests: delete after Phase 7, or keep? | Phase 7.9 | Delete (recommend) |

## Branch strategy

Each phase is its own branch off the previous phase's branch:

```
master
  └─ refactor/mailops-phase0
       └─ refactor/mailops-phase1
            └─ refactor/mailops-phase2
                 └─ refactor/mailops-phase3
                      └─ refactor/mailops-phase4
                           └─ refactor/mailops-phase5
                                └─ refactor/mailops-phase6
                                     └─ refactor/mailops-phase7
```

You can merge any phase to `master` once it's green — each is a safe stopping point. If you decide to stop after Phase 4, the codebase is already substantially better (god-objects gone) even though the singleton wiring (Phase 6) is still pending.

## Per-phase completion checklist (the short version)

Every phase's "Definition of done" boils down to:

- [ ] `tsc --noEmit` clean across the monorepo.
- [ ] `npm run lint` clean (zero errors, zero warnings).
- [ ] Phase 0 characterization tests pass unchanged.
- [ ] `server.ts` boots; HTTP contract to the web app unchanged.
- [ ] Commit(s) pushed; PR opened (or merged if you're working locally).
- [ ] STATUS.md updated.

## What does NOT change (true for every phase)

- The HTTP API contract — every endpoint, header, status code, response body.
- BullMQ queue topology, job names, retry/DLQ policy (plan 10's work).
- The Prisma schema — no migrations.
- The Gmail PubSub push contract (`/pubsub` JWT verification, response semantics).
- The tracking pixel / click-redirect contract.
- The web ↔ mailops auth boundary (`requireServiceToken`).

## Relationship to other plans

- **`plans/mailops-consolidation/`** — deliberately postponed per `refactor-plan/STATUS.md`. This refactor *enables* future consolidation (domain services + repositories port cleanly to Next.js API routes) but does not perform it.
- **`plans/refactor-plan/10` (BullMQ resilience)** — already done; untouched here. `BaseProcessor` template-method pattern preserved.
- **`plans/refactor-plan/03` (service auth + CORS)** — already done; `requireServiceToken` middleware untouched.
- **`plans/testing/01-testing-baseline.md`** — picks Vitest; Phase 0 + Phase 7 reuse that choice.
