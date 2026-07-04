# Mailops Refactor — Full Plan

> Behavior-preserving. Layered. Each piece replaceable. See [`README.md`](./README.md) for the why and the constraints.

The plan is split into **8 phases**, ordered so each builds on the previous and nothing is destroyed before its replacement exists. Each phase is independently shippable (typecheck + lint + tests green at the end of it). Estimated effort标注 at the top of each phase is rough — adjust to reality.

A running principle: **add the new seam first, migrate callers one at a time, then delete the old.** No big-bang rewrites.

---

## Phase 0 — Characterization tests (the safety net)

**Goal:** before touching anything, capture the *current* behavior of the three god-objects with integration tests, so we can prove the refactor didn't change it.

**Why first:** there are zero tests today. Refactoring without a net is exactly what you said you can't afford to verify. These tests are not "good unit tests" — they're **characterization tests**: they pin what the code does *today*, whether or not that's ideal.

**Scope — pick the highest-leverage paths only:**

1. **`EmailService.sendEmail`** (`lib/email/index.ts`) — feed in a fixed `EmailJobData` + a mocked Gmail client; assert the exact `EmailTracking`, `EmailEvent`, and stats writes that result. ~3 cases: tracked send, untracked send, send-then-replace-tracked-original.
2. **`TrackingService.handleEmailOpen` / `handleLinkClick`** (`lib/tracking/index.ts`) — given a tracking hash + a faked DB, assert the resulting `EmailEvent`, `TrackedLink`, `LinkClick` rows + the recomputed `SequenceStats`.
3. **`PubSubHandler.handleNotification`** (`services/pubsub/handler.ts`) — feed in a canned PubSub message + a faked Gmail history response; assert: reply path → `SequenceContact` status update + `EmailEvent.REPLIED`; bounce path → `EmailEvent.BOUNCED`; original-message path → no-op.
4. **`ScheduleProcessor`** (`services/jobs/schedule/processor.ts`) — given a set of `SequenceContact` rows with `nextScheduledAt` in the past, assert the right number of `EmailJob`s get enqueued with the right delays.

**How:**
- Add `vitest` (the testing plan at `plans/testing/01-testing-baseline.md` already picks Vitest; reuse it). These tests live under `apps/mailops/src/__tests__/characterization/`.
- Inject fakes through constructor params (Phase 1 introduces these seams; for Phase 0, use the seam-creation pattern inline — wrap the existing class in a tiny test-only subclass or use Vitest's `vi.mock` on `@coldjot/database` + `googleapis`).
- Each test asserts on **rows written** + **jobs enqueued** + **transport calls** — the three observable surfaces. Not on internal call order.

**Deliverable:** ~15–20 characterization tests, all green against the *current* code. They will keep passing unchanged through every subsequent phase. If any goes red mid-refactor, that's the early-warning signal.

**Estimated effort:** 1–2 days.

---

## Phase 1 — Introduce the seams (interfaces + composition root), no behavior change

**Goal:** put the layered skeleton in place without moving any logic. New files only; existing code keeps running as-is.

**New directories under `apps/mailops/src/`:**

```
adapters/               — interfaces + current concrete impls
  mail-transport.ts         interface MailTransport { send(...); deleteMessage(...); }
  inbox-source.ts           interface InboxSource { fetchHistory(...); fetchMessage(...); }
  clock.ts                  interface Clock { now(): Date; }   // for testable scheduling
  pubsub-client.ts          interface PubSubClient { ... }
repositories/           — one interface per aggregate, Prisma impl alongside
  email-tracking.repo.ts
  email-event.repo.ts
  sequence-contact.repo.ts
  sequence.repo.ts
  mailbox.repo.ts
  email-watch.repo.ts
services/domain/        — interfaces for the domain services
  send-email.service.ts
  tracking.service.ts
  inbox-sync.service.ts
  launch-sequence.service.ts
  run-schedule.service.ts
composition-root.ts     — the ONE place that wires concrete → interface
```

**Rules for this phase:**

- Interfaces only. No logic moves yet. The existing classes (`EmailService`, `TrackingService`, `PubSubHandler`, etc.) **stay where they are** and keep being imported directly by their current callers.
- The composition root is created but **not yet used by `server.ts`**. It exists, compiles, and is wired to the existing singletons — that's it.
- Repository interfaces are extracted by reading what each domain class actually does to Prisma and writing that as a method signature. The Prisma implementation just delegates to the existing `prisma.X.create(...)` calls (still in their original location).

**Deliverable:** `composition-root.ts` compiles, instantiates a fully-wired app graph in a scratch `__tests__/wiring.test.ts`, but production still boots the old way. ~0 lines of behavior change.

**Estimated effort:** 2–3 days.

---

## Phase 2 — Move routes → controllers (extract the HTTP/business boundary)

**Goal:** route handlers become thin; business logic moves into `controllers/*` which in turn call the (still-existing) libs directly. No new interfaces needed yet — this is purely a relocation.

**Files to split:**

- `routes/sequence/controller.ts` (274 lines) → split into:
  - `controllers/sequence.controller.ts` — calls `lib/email`, `lib/schedule`, `services/monitor`, `jobManager`. Pure orchestration; returns plain objects.
  - `routes/sequence/index.ts` — stays; just calls the controller and shapes the HTTP response.
  - `controllers/sequence.validator.ts` — moved from `routes/sequence/validator.ts`.

- `routes/mailbox.ts` (128 lines) → `controllers/mailbox.controller.ts` + thin route.
- `routes/lists/index.ts` → `controllers/list.controller.ts` + thin route.
- `routes/health/controller.ts`, `routes/metrics/controller.ts` → already split; just relocate to `controllers/`.

**Rules:**

- **Move-only commits.** The controller methods are byte-for-byte the bodies of the current route handlers. First commit moves the code; second wires the route to call the controller.
- No `requireServiceToken` changes. No CORS changes. No response-shape changes.

**Deliverable:** `routes/*` files are all ≤ ~30 lines and contain only Express glue. Controllers own the business calls. Characterization tests unaffected (they don't hit HTTP).

**Estimated effort:** 1 day.

---

## Phase 3 — Extract repositories; isolate Prisma

**Goal:** every Prisma call now lives behind a repository. Domain code depends on `EmailTrackingRepository`, not on `prisma.emailTracking.create(...)`.

**Approach:**

1. For each repository interface from Phase 1, write the Prisma implementation by literally copy-pasting the existing `prisma.X.*` call + its immediate argument-building into a method.
2. Replace the original call site with a call to the injected repository.
3. Migrate one aggregate at a time (start with `EmailTracking`, then `EmailEvent`, `SequenceContact`, `Sequence`, `Mailbox`, `EmailWatch`).

**Hardest cases (do these last in the phase, after the easy ones build muscle memory):**

- `services/pubsub/handler.ts` — touches `EmailEvent`, `SequenceContact`, `EmailWatch`, `EmailWatchHistory`, `ProcessedMessage`. Heavy.
- `lib/email/index.ts` — `EmailTracking`, `EmailEvent`, `SequenceStats`, plus the tracked-message delete.
- `lib/tracking/index.ts` — `EmailTracking`, `TrackedLink`, `LinkClick`, `EmailEvent`, `SequenceStats`.

**Rules:**

- Each migration is its own commit: "extract EmailTrackingRepository; migrate EmailService".
- The repository is injected via constructor; the composition root (Phase 1) wires the Prisma impl.
- Tests: characterization tests from Phase 0 now inject a fake repository instead of mocking `@coldjot/database`. Update them mechanically — the *assertions* don't change, only how the fake is wired in.

**Deliverable:** `grep -r "prisma\." apps/mailops/src` returns matches only inside `repositories/*` and `composition-root.ts`. Domain code is Prisma-free.

**Estimated effort:** 3–4 days.

---

## Phase 4 — Split the three god-objects

This is the heart of the refactor. Each god-object becomes a small domain service orchestrating narrow collaborators.

### 4a — `lib/tracking/index.ts` (804 lines) → one service, one responsibility

**Today's mess:**
- Standalone exports: `createEmailTracking`, `recordEmailOpen`, `recordLinkClick`, `trackEmailEvent`, `updateTrackingStats`, plus helpers.
- A `TrackingService` class that re-implements `handleEmailOpen` / `handleLinkClick` / `trackEmailEvent` — same logic, different entry point.
- Two stats strategies: `trackEmailEvent` does inline rate math; `updateTrackingStats` uses `calculateRates`.
- Commented-out code (lines 193–198), leftover `console.log` (lines 303–305).

**Target:**

```
services/domain/tracking.service.ts        — TrackingServiceImpl implements TrackingService
  handleEmailOpen(hash)                    — the ONE open path
  handleLinkClick(hash, url)               — the ONE click path
lib/tracking/
  pixel.ts                                 — pixel PNG generation (pure)
  link-wrap.ts                             — link wrapping (pure)
  stats.ts                                 — updateTrackingStats + calculateRates (consolidated)
repositories/*                             — Phase 3 already moved the DB writes
```

**Steps:**

1. Decide which stats path is canonical (the `calculateRates` one — it's used by `lib/stats/index.ts` too). Delete the inline duplication in `trackEmailEvent`.
2. Pick the class API as canonical (consumers should depend on the `TrackingService` interface). Convert the standalone exports into thin delegators that call the impl — keep them temporarily so existing imports don't break.
3. Migrate every importer to the interface (one commit per importer directory).
4. Delete the standalone delegators.
5. Move `pixel.ts` / `link-wrap.ts` out; they're pure functions and belong together, not interleaved with DB code.

**Deliverable:** `tracking.service.ts` ≤ 150 lines. Pure helpers isolated. Single open/click path each. Characterization tests for open/click still pass.

### 4b — `lib/email/index.ts` (427 lines) → orchestration + transport + message builder

**Today's mess:** `sendEmail` does everything. Also: hardcoded `const useApi = true` makes SMTP dead; stray `null;` (line 134); unused private `createEmailTrackingRecord`.

**Target:**

```
adapters/mail-transport.ts                — interface MailTransport
adapters/gmail-transport.ts               — GmailClientService.send → MailTransport
adapters/smtp-transport.ts                — sendGmailSMTP → MailTransport (resurrect as real fallback OR delete honestly)
services/domain/send-email.service.ts     — SendEmailServiceImpl
  send(jobData)
    1. build message (via lib/email/helper.ts — already pure)
    2. resolve subject (lib/email-subject.ts — already pure)
    3. replace placeholders (lib/placeholders — already pure)
    4. transport.send(...)                 ← the seam: Gmail today, anything tomorrow
    5. tracking.handleEmailSent(...)       ← records tracking + event
    6. stats.update(...)
lib/email/helper.ts                       — pure message construction (already isolated)
```

**Steps:**

1. Extract `GmailTransport implements MailTransport` — wraps the current `gmailClientService.send` + the delete-original-then-send-tracked dance.
2. **Make a decision on SMTP:** either (a) wire it back as a real fallback behind `MailTransport` and remove `const useApi = true`, or (b) **delete it** and the `lib/google/smtp/*` files honestly. Recommend (b) — dead code that pretends to be live is worse than no fallback. Flag this as the one place you might want to keep behavior; if unsure, keep (a).
3. Extract `SendEmailServiceImpl`. The ~200-line method becomes a ~30-line orchestrator calling narrow collaborators.
4. Migrate `EmailProcessor` (`services/jobs/email/processor.ts`) to call `SendEmailService` instead of `EmailService`.
5. Delete the old `EmailService` class.

**Deliverable:** `send-email.service.ts` ≤ 100 lines. SMTP either real or gone. Characterization tests for tracked/untracked sends still pass.

### 4c — `services/pubsub/handler.ts` (1,366 lines) → pipeline of small stages

**Today's mess:** one class does decode → token refresh → history fetch → message fetch → classify → DB write → state mutation → stats → large-gap recovery.

**Target — a pipeline:**

```
services/domain/inbox-sync.service.ts     — InboxSyncService orchestrator (≤150 lines)
  handleNotification(message)
    1. notification = decodeNotification(message)           — pure (already in helper.ts)
    2. watch = watchRepo.findByEmail(notification.email)    — Phase 3
    3. records = inboxSource.fetchHistory(watch, ...)       — adapter (Gmail today)
    4. for each record:
         details? = inboxSource.fetchMessage(...)            — adapter
         classified = classify(record, details)              — pure (move from utils + helper)
         applyClassification(classified)                     — domain rule
           → writes EmailEvent (repo)
           → updates SequenceContact status (repo)
           → updates stats

services/inbox-sync/classify.ts           — pure predicates (reply / bounce / original / external)
services/inbox-sync/states.ts             — SequenceContact status transitions (the "what should happen on a reply")
adapters/gmail-inbox-source.ts            — wraps history.list + messages.get + token refresh
```

**Steps:**

1. Move the pure classification logic (`isBounceMessage`, `isReplyMessage`, `shouldProcessMessage`, `determineNewStatus`, `calculateHistoryGap`, `isLargeHistoryGap`) into `services/inbox-sync/classify.ts`. Most already live in `utils/email.ts` + `services/pubsub/helper.ts` — this is mostly a relocation.
2. Extract `GmailInboxSource implements InboxSource` — owns token refresh, history pagination, message fetch. This is the only place that talks to Gmail REST.
3. Extract `InboxSyncServiceImpl` — the orchestrator. Reads as a flat sequence of steps.
4. The `PubSubService` (`services/pubsub/client.ts`) now just receives the push and calls `inboxSync.handleNotification(...)`.
5. **Bonus:** the dormant `ThreadProcessor` (`services/jobs/thread-watch/processor.ts`, 846 lines) becomes a second `InboxSource` impl (polling). If you ever want it back, it's a clean swap. For now, leave it dormant but moved under `services/inbox-sync/polling-source.ts` and marked `@deprecated` in a doc comment.

**Deliverable:** no file in `services/` exceeds ~250 lines. PubSub pipeline reads top-to-bottom as a sequence of named steps. Characterization tests for reply/bounce/original paths still pass.

**Estimated effort for Phase 4:** 5–7 days total (4a: 1–2, 4b: 1–2, 4c: 3).

---

## Phase 5 — Delete dead code & clean up

Now that the seams exist and the god-objects are split, the leftover scaffolding can go.

**Delete:**

- `services/init.ts` — orphaned; `server.ts` doesn't import it.
- `services/jobs/thread-watch/processor.ts` — moved/absorbed in Phase 4c. If not reused, delete outright.
- Trailing commented-out duplicate exports in `services/watch/index.ts` (lines ~389–421).
- Commented-out block in `lib/tracking/index.ts` (lines 193–198) — already gone after 4a.
- Stray `null;` in `lib/email/index.ts:134` — already gone after 4b.
- `lib/google/index.ts` / `lib/google/gmail.ts` / `lib/google/helper.ts` — barrel/re-export shims that the new adapter files replace.
- The `// TODO: Remove this if possible` factory in `service-manager.ts:293-297` — addressed in Phase 6.

**Consolidate logging:** kill the remaining `console.log` / `console.error` in `lib/tracking` and `lib/email` — everything routes through `pino` (the redacting logger from refactor-plan 09).

**Estimated effort:** 0.5 days.

---

## Phase 6 — `ServiceManager` → real composition root

**Goal:** replace the god-object singleton with a plain composition root. This is the capstone — it's what makes everything truly testable and replaceable.

**Today:** `ServiceManager` (297 lines) owns Redis + memory monitor + rate-limit + PubSub + every queue + every DLQ + every processor + watch cleanup. `getInstance()` is called from processors and routes.

**Target:**

- `composition-root.ts` (started in Phase 1) is now the *only* place that constructs things. It builds the adapter impls, the repository impls, the domain service impls, and the job processors — all from concrete classes — and returns a single `App` object.
- `server.ts` calls `createApp()` once at boot, passes `app` to the route modules (via `req.app.locals` or a closure), and to `mountBullBoard`.
- **No more `getInstance()`** anywhere outside `composition-root.ts`. Processors receive their dependencies via constructor.
- The factory `createServiceManager` and its TODO comment go away.

**Migration:**

1. Make `ServiceManager` a thin facade over `composition-root.ts` — methods just delegate to the wired graph.
2. Migrate every `ServiceManager.getInstance()` call site to take the dependency via constructor.
3. Delete the facade.

**Deliverable:** `grep -r "getInstance" apps/mailops/src` returns matches only inside `composition-root.ts` (for the genuinely-global things like the Redis connection, if you choose to keep it a singleton — or zero matches if you inject that too).

**Estimated effort:** 2 days.

---

## Phase 7 — Tests, round two

With everything injected and singleton-free, write the tests you actually want (not just characterization):

- **Unit tests** per domain service — fast, no DB. Fake repositories + fake adapters.
- **Adapter tests** — `GmailTransport`, `GmailInboxSource` against recorded VCR-style fixtures (record one real Gmail response, replay it forever).
- **Processor tests** — feed a BullMQ `Job` with fake data, assert the domain service was called correctly.
- **One happy-path integration test per phase-4 split** — wires real Prisma-against-test-DB + faked Gmail, runs the full send/open/click/reply/bounce flow end-to-end.

**Estimated effort:** 2–3 days.

---

## Sequencing summary

| Phase | What | Why this order |
|---|---|---|
| 0 | Characterization tests | Safety net must exist *before* any move |
| 1 | Interfaces + composition root (unused) | Seams in place; nothing moved yet |
| 2 | Routes → controllers | Pure relocation; smallest risk; builds confidence |
| 3 | Repositories isolate Prisma | Domain code becomes DB-agnostic |
| 4 | Split the three god-objects | The actual refactor; each split is independently shippable |
| 5 | Delete dead code | Cleanup only safe after Phase 4 |
| 6 | Kill `ServiceManager` singleton | Capstone; depends on Phases 1–4 wiring being in place |
| 7 | Real test suite | Now that injection works, tests are cheap to write |

## What does NOT change

- `server.ts`'s shape (Express + middleware order + port + signal handling).
- The HTTP API contract — every endpoint, header, status code, response body identical.
- The BullMQ queue topology, job names, retry/DLQ policy (plan 10's work stays intact).
- The Prisma schema (no migrations; this is purely how code talks to the DB).
- The Gmail PubSub push contract (`/pubsub` JWT verification, response semantics).
- The tracking pixel / click-redirect contract.
- The web↔mailops auth boundary (`requireServiceToken`).

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Subtle behavior change in a god-object split slips through | Phase 0 characterization tests must keep passing at every commit. CI gate. |
| Injecting dependencies makes processor construction verbose | The composition root absorbs all of it; processors stay ≤ ~5 constructor args |
| PubSub handler has the most embedded business rules | Phase 4c is scheduled last among the three splits and gets the most characterization coverage |
| SMTP branch removal (4b option b) removes a "fallback" that someone might rely on | Default to option (a) — keep SMTP behind `MailTransport` — unless you confirm it's unused |
| Refactor takes long enough to conflict with the postponed consolidation | Phase ordering means consolidation can happen *at any point* — even mid-refactor, the seams only help |

## Definition of done

1. `tsc --noEmit` clean, ESLint 0/0, all tests green.
2. Every file in `apps/mailops/src/{lib,services,routes}` ≤ ~300 lines (god-objects ≤ ~150).
3. No `getInstance()` outside `composition-root.ts`.
4. No direct `prisma.*` access outside `repositories/*`.
5. No `console.log` in source (only `logger`).
6. No commented-out code blocks.
7. Characterization tests from Phase 0 still pass unchanged.
8. A new `MailTransport` / `InboxSource` / `EmailTrackingRepository` impl can be added by touching only the composition root + the new file.
