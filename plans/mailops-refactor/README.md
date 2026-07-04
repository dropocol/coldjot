# Mailops Refactor Plan

> **Behavior-preserving structural refactor** of `apps/mailops`. Compartmentalize the monolith into layered, replaceable units (transport, repository, domain service, job, controller). No functionality changes — output of every code path stays identical. Each layer sits behind an interface so any one piece (Gmail adapter, Prisma, BullMQ, the tracking module) can be swapped later without rippling through the rest.

## Read this first

- **[`STATUS.md`](./STATUS.md)** — phase tracker + open decisions. Start here.
- **[`plan.md`](./plan.md)** — the full plan, layer by layer, with file:line refs and a phased sequence.
- **Sub-plans** (one per phase, each self-contained with step-by-step instructions, file:line refs, definition of done, and commit plan):
  - [Phase 0 — characterization tests](./phase-0-characterization-tests.md)
  - [Phase 1 — seams + composition root](./phase-1-seams-composition-root.md)
  - [Phase 2 — routes → controllers](./phase-2-routes-to-controllers.md)
  - [Phase 3 — repositories isolate Prisma](./phase-3-repositories.md)
  - [Phase 4 — split the three god-objects](./phase-4-split-god-objects.md)
  - [Phase 5 — dead code cleanup](./phase-5-dead-code-cleanup.md)
  - [Phase 6 — kill ServiceManager singleton](./phase-6-kill-service-manager.md)
  - [Phase 7 — real test suite](./phase-7-test-suite.md)

## TL;DR — what's wrong today

A standalone Express + BullMQ service that *works* but is hard to reason about, hard to test, and hard to change:

1. **Three god-objects** do most of the real work and mix 4–6 concerns each:
   - `services/pubsub/handler.ts` — **1,366 lines**: notification decode → OAuth refresh → Gmail history fetch → message fetch → reply/bounce classification → `EmailEvent` write → `SequenceContact` state mutation → stats. One class.
   - `lib/tracking/index.ts` — **804 lines**: exports BOTH a set of standalone functions (`recordEmailOpen`, `trackEmailEvent`, `updateTrackingStats`) AND a `TrackingService` class with overlapping methods doing the same thing. Two parallel stats strategies, commented-out blocks, leftover `console.log`s.
   - `lib/email/index.ts` — **427 lines**: `sendEmail` does transport selection + tracked/untracked message construction + Gmail send + delete/replacement + `EmailTracking`/`EmailEvent` writes + stats — in one ~200-line method. Has a hardcoded `const useApi = true` that makes the SMTP branch dead in practice.

2. **Routes do business logic.** `routes/sequence/controller.ts` (274 lines) does its own Prisma writes, creates `BusinessHours` if missing, and calls `jobManager` + `monitoringService` directly — no service layer in between.

3. **Singleton coupling everywhere.** `ServiceManager`, `PubSubService`, `MemoryMonitor`, `RateLimitService`, `GmailClientService`, `RedisConnection` are all `getInstance()` singletons, and every processor reaches into `ServiceManager.getInstance()` + the global `prisma` directly. This is *why there are zero tests* — nothing can be instantiated in isolation.

4. **Dead code masquerading as live code:** `services/jobs/thread-watch/processor.ts` (846 lines) is commented out in `service-manager.ts:174-175`. `services/init.ts` is orphaned — `server.ts` calls `createServiceManager()` directly. `services/watch/index.ts` has ~30 lines of duplicate trailing commented-out exports.

5. **No tests.** `jest`/`sinon` are in devDeps, the `test` script exists, but there are no `*.test.ts` files. Hard to refactor safely without at least characterization tests.

## The guiding principle

> **Layered + injected, not singleton + global.** Every external concern (Gmail API, SMTP, Prisma, Redis, BullMQ, clock) lives behind a narrow interface and is *passed in* to the thing that uses it. The job processors become thin orchestrators that call domain services, which call repositories, which call Prisma. Routes become thin HTTP adapters that call controllers, which call services. Nothing reaches across layers for a concrete dependency.

This is what makes each piece *individually replaceable*:

| Want to replace… | What changes |
|---|---|
| Gmail API with another provider | Implement `MailTransport` against the new provider. Nothing else moves. |
| Prisma with Drizzle/raw SQL | Implement the repository interfaces. Services don't know. |
| BullMQ with DB-as-queue (the postponed `mailops-consolidation` plan) | The domain services already don't talk to BullMQ — only the thin `*Processor` wrappers do. |
| The tracking module | `TrackingService` interface is the only thing consumers import. |
| PubSub push with polling | `InboxSyncService` interface has two impls already (PubSub active, ThreadWatch dormant). Pick one. |

## Target layering

```
┌─────────────────────────────────────────────────────────────┐
│  HTTP layer        routes/* + validators                     │  thin Express adapters
├─────────────────────────────────────────────────────────────┤
│  Controller layer  controllers/*                             │  request → service call → response
├─────────────────────────────────────────────────────────────┤
│  Domain services   services/domain/*                         │  business rules (SendEmail, RecordOpen,
│                    (the "what", not the "how")               │   SyncInbox, LaunchSequence, RunSchedule)
├─────────────────────────────────────────────────────────────┤
│  Repositories      repositories/*                            │  Prisma access, one per aggregate
├─────────────────────────────────────────────────────────────┤
│  Adapters          adapters/* (gmail, smtp, pubsub, clock)   │  external systems behind interfaces
├─────────────────────────────────────────────────────────────┤
│  Job processors    jobs/* (thin BullMQ wrappers)             │  deserialize job → call domain service
├─────────────────────────────────────────────────────────────┤
│  Infra wiring      composition-root.ts + service-manager.ts  │  the ONLY place that knows concretely
└─────────────────────────────────────────────────────────────┘
```

The composition root is the only file that constructs real instances and wires them together. Everything else depends on an interface.

## Relationship to existing plans

- **`plans/mailops-consolidation/`** — deliberately **postponed** per `refactor-plan/STATUS.md`. This refactor does *not* conflict with it: it makes consolidation *easier* later, because the domain services + repositories will port straight into Next.js API routes, and only the thin BullMQ processor wrappers + composition root get deleted.
- **`plans/refactor-plan/10` (BullMQ resilience)** — already code-done; untouched here. The `BaseProcessor` template-method pattern is preserved.
- **`plans/refactor-plan/03` (service auth + CORS)** — already done; the route-level `requireServiceToken` middleware stays exactly as-is.

## Scope & constraints

- ✅ **In scope:** restructure into layers, extract interfaces, inject dependencies, delete dead code, remove the duplicate tracking surface, split the three god-objects, isolate Prisma behind repositories, characterization tests covering **every** feature, permanent test suite with full coverage at the end.
- ❌ **Out of scope (deliberately):** changing any observable behavior, swapping BullMQ/Prisma/Gmail for alternatives (only the *seams* are added — actual swaps are follow-ups), consolidating into the Next.js app, schema changes.

### Locked decisions

| Decision | Outcome |
|---|---|
| SMTP path (`useApi = true` dead branch) | **Delete.** Focus on Gmail. Preserve the `MailTransport` interface as the seam for future providers (SMTP, Outlook, send-through-API). Keep `lib/email/helper.ts` + `lib/google/gmail/helper.ts` (reused). Remove `nodemailer` + `quoted-printable`. |
| Dormant `ThreadProcessor` (846 lines, commented out) | **Delete** in Phase 5. `InboxSource` interface is the future seam for any polling/IMAP implementation. |
| Infra singletons (`Redis`, `MemoryMonitor`, `RateLimit`, `PubSub`) | **Keep as process-wide singletons**, constructed inside `createApp()` only. |
| Phase 0 characterization tests | **Delete** in Phase 7.9 once the permanent suite covers every row in the [Feature → test mapping](./phase-7-test-suite.md#feature--test-mapping). |

## Verification strategy

Because you can't fully test the live system, every phase is designed to be **mechanically verifiable** before moving on:

1. **`tsc --noEmit` + ESLint clean** after every commit.
2. **Characterization tests** captured *before* any refactor: 15 test files (Groups A–O) pinning current input→output behavior for **every** mailops feature. Run before AND after each phase; if the assertions still pass, behavior is preserved. See [Phase 0 coverage matrix](./phase-0-characterization-tests.md#coverage-matrix).
3. **Diff discipline:** each commit is one concern, one layer, or one god-object split — never "refactor + behavior change" in the same commit.
4. **Behavior-preserving markers:** where a method is moved verbatim, the commit message says `move-only`; where logic is genuinely reshaped (rare), it's called out explicitly with a before/after.
5. **Final coverage:** at the end of Phase 7, every feature has permanent test coverage (unit + adapter + repository + integration). Coverage targets enforced in CI. See [Phase 7 Feature → test mapping](./phase-7-test-suite.md#feature--test-mapping).
