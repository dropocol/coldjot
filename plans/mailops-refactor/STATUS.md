# Mailops Refactor — Status

> Sub-plan tracker. Update this as each phase ships. Detailed step-by-step in each phase doc.
> **Picking up mid-phase?** Read [`HANDOFF.md`](./HANDOFF.md) first — it has the resume steps + solved pitfalls.
>
> **Legend:** ⬜ Not started · 🟡 In progress · 🟢 Code done, awaiting verification · ✅ Done · ⏸️ Blocked/Deferred

## At-a-glance

| Phase | Doc | Status | Sub-branch | Effort |
|---|---|---|---|---|
| 0 | [characterization tests](./phase-0-characterization-tests.md) | 🟡 **In progress** — 3/15 groups, 23 cases passing | `refactor/mailops-phase-0-tests` | 2–3 days |
| 1 | [seams + composition root](./phase-1-seams-composition-root.md) | ⬜ Not started | `refactor/mailops-phase-1-seams` | 2–3 days |
| 2 | [routes → controllers](./phase-2-routes-to-controllers.md) | ⬜ Not started | `refactor/mailops-phase-2-controllers` | 1 day |
| 3 | [repositories isolate Prisma](./phase-3-repositories.md) | ⬜ Not started | `refactor/mailops-phase-3-repos` | 3–4 days |
| 4 | [split three god-objects](./phase-4-split-god-objects.md) | ⬜ Not started | `refactor/mailops-phase-4-split` | 5–7 days |
| 5 | [dead code cleanup](./phase-5-dead-code-cleanup.md) | ⬜ Not started | `refactor/mailops-phase-5-cleanup` | 0.5–1 day |
| 6 | [kill ServiceManager singleton](./phase-6-kill-service-manager.md) | ⬜ Not started | `refactor/mailops-phase-6-singleton` | 2 days |
| 7 | [real test suite](./phase-7-test-suite.md) | ⬜ Not started | `refactor/mailops-phase-7-tests` | 3–4 days |

**Estimated total:** ~19–25 days of focused work. Each phase is independently shippable.

## Sequencing rules

- **Phases must ship in order.** Each builds on interfaces / migrations from the previous.
  - Exception: Phase 5 (cleanup) can run in parallel with Phase 6 if needed — they touch different files.
- **Each phase ends green:** `tsc --noEmit` + ESLint + Phase 0 characterization tests all pass.
- **One commit per step** within a phase (each phase doc specifies the commits).
- **The SMTP decision (Phase 4b)** needs your sign-off before 4b starts: delete the dead branch (default) or resurrect it behind `MailTransport`.

## Open decisions (resolve before the relevant phase starts)

| # | Decision | Where | Default |
|---|---|---|---|
| ~~1~~ | ~~SMTP path: delete dead code or resurrect as real fallback?~~ | Phase 4b | **✅ DECIDED: Delete** the `useApi = true` branch + SMTP transport + `nodemailer`. Preserve the `MailTransport` interface seam so a future SMTP/IMAP provider can be added without touching the orchestrator. Keep `lib/google/gmail/helper.ts`'s thread-info + token-refresh helpers (reused by `GmailInboxSource` in Phase 4c). |
| ~~2~~ | ~~Dormant `ThreadProcessor` (846 lines): delete or absorb as `PollingInboxSource`?~~ | Phase 4c.7 | **✅ DECIDED: Delete.** It's commented out in `service-manager.ts:174-175` and unreferenced. The `InboxSource` interface (Phase 1) is the future seam for any polling implementation — a clean reimplementation against that interface is cheaper than resurrecting pre-refactor code. |
| ~~3~~ | ~~`RedisConnection` + `MemoryMonitor`: keep as process-wide singletons or convert to plain classes?~~ | Phase 6.6 | **✅ DECIDED: Keep as singletons** (constructed inside `createApp()`, `getInstance()` called only there). `RateLimitService` + `PubSubService` also kept as singletons for now. |
| ~~4~~ | ~~Phase 0 characterization tests: delete after Phase 7, or keep?~~ | Phase 7.9 | **✅ DECIDED: Delete** once Phase 7's real suite covers the same behavior. |

> **All four decisions are locked.** Future inbox features (you mentioned adding more) plug in via the `MailTransport` + `InboxSource` interfaces from Phase 1 — no need to keep dead SMTP/polling code around "just in case".

## Branch strategy

**Base branch:** `refactor/mailops` (created off `upgrade/remaining-majors`; the plan docs are committed there at `9bf70cb`).

Each phase is a **sub-branch** off the previous phase's sub-branch (or off `refactor/mailops` for Phase 0). Sub-branches use the **hyphen** scheme `refactor/mailops-phase-N-<short>` (git does not allow a branch to be both a leaf and a directory prefix, so `refactor/mailops/phase-N` is rejected — use hyphens):

```
upgrade/remaining-majors
  └─ refactor/mailops                            ← base; plan docs live here
       └─ refactor/mailops-phase-0-tests         ← CURRENT (3/15 groups done)
            └─ refactor/mailops-phase-1-seams
                 └─ refactor/mailops-phase-2-controllers
                      └─ refactor/mailops-phase-3-repos
                           └─ refactor/mailops-phase-4-split
                                └─ refactor/mailops-phase-5-cleanup
                                     └─ refactor/mailops-phase-6-singleton
                                          └─ refactor/mailops-phase-7-tests
```

**Operating rules:**

- Create a phase's sub-branch from the *previous* phase's sub-branch tip (so Phase N sees all of Phase N-1's work). For Phase 0, branch off `refactor/mailops`.
- Each phase ends by merging its sub-branch back into `refactor/mailops` (fast-forward or `--no-ff` to preserve the phase boundary in history).
- After merge, the next phase branches off the updated `refactor/mailops` tip.
- Commits within a phase follow the per-step commit plan in each phase doc (one commit per step).
- `refactor/mailops` itself is merged to `master` only at the very end (after Phase 7), once the full test suite is green.
- You can stop at any phase boundary — each is a safe, shippable checkpoint. If you stop after Phase 4, the god-objects are gone even though the singleton wiring (Phase 6) is still pending.

**Quick commands:**

```bash
# Start a phase:
git checkout refactor/mailops           # or the previous phase's sub-branch
git checkout -b refactor/mailops/phase-N-<short>

# Finish a phase:
git checkout refactor/mailops
git merge --no-ff refactor/mailops/phase-N-<short> -m "merge: phase N — <title>"
```

## Per-phase completion checklist (the short version)

Every phase's "Definition of done" boils down to:

- [ ] `tsc --noEmit` clean across the monorepo.
- [ ] `npm run lint` clean (zero errors, zero warnings).
- [ ] **All** Phase 0 characterization tests pass unchanged (the safety net — see Phase 0 for the full coverage list).
- [ ] `server.ts` boots; HTTP contract to the web app unchanged.
- [ ] Commit(s) pushed on the phase's sub-branch; sub-branch merged into `refactor/mailops`.
- [ ] STATUS.md updated (phase row → ✅).

## Final coverage requirement

**At the end of Phase 7, every mailops feature has test coverage.** Phase 0 characterizes current behavior (so the refactor provably changes nothing); Phase 7 replaces those with a permanent suite organized by layer (unit / adapter / repository / integration). The Phase 7 doc lists each feature and which test type covers it — nothing ships untested. See [Phase 0 § Coverage matrix](./phase-0-characterization-tests.md#coverage-matrix) and [Phase 7 § Feature → test mapping](./phase-7-test-suite.md#feature--test-mapping).

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
