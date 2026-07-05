# Mailops Refactor — Status

> **Single source of truth** for the refactor's progress, branch layout, locked decisions, and how to resume. (Replaces the former `HANDOFF.md` + `PHASE-0-PROGRESS.md` — both deleted.)
>
> **Picking up mid-phase?** Jump to [Resume guide](#resume-guide).
>
> **Legend:** ⬜ Not started · 🟡 In progress · 🟢 Code done, awaiting verification · ✅ Done · ⏸️ Blocked/Deferred

## At-a-glance

| Phase | Doc | Status | Sub-branch | Effort |
|---|---|---|---|---|
| 0 | [characterization tests](./phase-0-characterization-tests.md) | ✅ **Done** — 15/15 groups, 100 cases passing | `refactor/mailops-phase-0-tests` (merged) | 2–3 days |
| 1 | [seams + composition root](./phase-1-seams-composition-root.md) | ✅ **Done** — interfaces + Prisma impls + createApp() + wiring test + lint rule | `refactor/mailops-phase-1-seams` (merged) | 2–3 days |
| 2 | [routes → controllers](./phase-2-routes-to-controllers.md) | ✅ **Done** — route files thinned, logic moved to controllers/ | `refactor/mailops-phase-2-controllers` (merged) | 1 day |
| 3 | [repositories isolate Prisma](./phase-3-repositories.md) | ✅ **Done** — 10/10 aggregates migrated (3.1–3.10), merged `--no-ff` (`4d6571d`). 102/102 tests green. Lint-rule promotion deferred to Phase 4 (8 residuals are `$transaction` tx clients, SMTP path, sequenceHealth). | `refactor/mailops-phase-3-repos` (merged) | 3–4 days |
| 4 | [split three god-objects](./phase-4-split-god-objects.md) | ✅ **Done** — 4a (tracking) + 4b (email) + 4c (pubsub) all merged `--no-ff` (`44e55df`, `40fe9d2`, `0bc50fa`). 98/98 tests green; tsc clean; 0 errors / 260 warnings | `refactor/mailops-phase-4c-pubsub` (merged) | 5–7 days |
| 5 | [dead code cleanup](./phase-5-dead-code-cleanup.md) | ✅ **Done** — 5 files deleted, console sweep, deps pruned. 98/98 tests green; tsc clean; 0 errors / 244 warnings | `refactor/mailops-phase-5-cleanup` (merged) | 0.5–1 day |
| 6 | [kill ServiceManager singleton](./phase-6-kill-service-manager.md) | ✅ **Done** — ServiceManager deleted (297 lines); composition root owns the full graph; controllers → factories; routes → `makeRouter(app)`. 98/98 tests green; tsc clean; 0 errors / 242 warnings | `refactor/mailops-phase-6-singleton` (merged) | 2 days |
| 7 | [real test suite](./phase-7-test-suite.md) | ⬜ Not started | `refactor/mailops-phase-7-tests` | 3–4 days |

**Estimated total:** ~19–25 days of focused work. Each phase is independently shippable.

## Branch layout

**Base branch:** `refactor/mailops` (off `upgrade/remaining-majors`; plan docs committed at `9bf70cb`).

Sub-branches use the **hyphen** scheme `refactor/mailops-phase-N-<short>` (git rejects the slash scheme — `refactor/mailops` is already a leaf, so `refactor/mailops/phase-N` can't also be a prefix):

```
upgrade/remaining-majors
  └─ refactor/mailops                            ← base; plan docs live here; CURRENT HEAD
       └─ refactor/mailops-phase-0-tests         (merged — 15/15 groups)
            └─ refactor/mailops-phase-1-seams         (merged)
                 └─ refactor/mailops-phase-2-controllers (merged)
                      └─ refactor/mailops-phase-3-repos (merged — 10/10 aggregates; lint promotion deferred to Phase 4)
                           └─ refactor/mailops-phase-4-split  ← NEXT
                                └─ refactor/mailops-phase-5-cleanup
                                     └─ refactor/mailops-phase-6-singleton
                                          └─ refactor/mailops-phase-7-tests
```

**Operating rules:**
- Branch each phase off the *previous* phase's tip (Phase 0 branches off `refactor/mailops`).
- Each phase ends by merging its sub-branch back into `refactor/mailops` (`--no-ff` to preserve the boundary).
- `refactor/mailops` merges to `master` only at the very end (after Phase 7).
- Stop at any phase boundary — each is a safe, shippable checkpoint.

**Quick commands:**
```bash
# Start a phase:
git checkout refactor/mailops-phase-<N-1>-<short>   # previous phase tip
git checkout -b refactor/mailops-phase-<N>-<short>

# Finish a phase:
git checkout refactor/mailops
git merge --no-ff refactor/mailops-phase-<N>-<short> -m "merge: phase N — <title>"
```

## Sequencing rules

- **Phases must ship in order.** Each builds on interfaces / migrations from the previous.
  - Exception: Phase 5 (cleanup) can run in parallel with Phase 6 if needed.
- **Each phase ends green:** `tsc --noEmit` + ESLint + Phase 0 characterization tests all pass.
- **One commit per step** within a phase (each phase doc specifies the commits).

## Locked decisions

All four architectural decisions are settled — don't re-litigate:

| Decision | Outcome |
|---|---|
| ~~SMTP path~~ | **✅ Delete** in Phase 4b. The `useApi = true` branch + `lib/google/smtp/*` + `nodemailer` go. The `MailTransport` interface is preserved as the seam for any future provider (SMTP, Outlook, send-through-API). `lib/email/helper.ts` + `lib/google/gmail/helper.ts` are kept (reused). |
| ~~Dormant ThreadProcessor (846 lines)~~ | **✅ Delete** in Phase 5. It's commented out in `service-manager.ts:174-175` and unreferenced. `InboxSource` is the future seam for any polling/IMAP implementation. |
| ~~Infra singletons~~ | **✅ Keep** `RedisConnection`, `MemoryMonitor`, `RateLimitService`, `PubSubService` as process-wide singletons (constructed inside `createApp()` only). |
| ~~Characterization tests~~ | **✅ Delete** in Phase 7.9 once the permanent suite covers every feature. |

> Future inbox features plug in via the `MailTransport` + `InboxSource` interfaces from Phase 1 — no need to keep dead SMTP/polling code around "just in case".

### Local types stay co-located (no `types/` folder) — decided 2026-07-06

A `apps/mailops/src/types/` folder was considered for "single source of coverage." **Decision: don't create one.** The ~100 type/interface defs across ~30 files fall into 6 categories, and the big groups are *deliberately* co-located with their aggregate/impl:

- **Repository `*Record` + `*Repository` interfaces** (~40 types) — Phase 3's DDD aggregate pattern; the data shape lives with the operations on it.
- **Adapter interfaces + their DTOs** (`MailTransport` + `SendMessageInput` + `SentMessageDetails`; `InboxSource` + `FetchHistoryInput`) — the DTOs are the interface's parameters.
- **Domain service interfaces** (`TrackingService`, `SendEmailService`, etc.) — Phase 4 (decision 4b.5) *moved these into* the impl files specifically to stop fragmenting interface from impl. A `types/` folder re-fragments that.
- **Controller `*Deps`** + **config-derived `typeof` types** — describe one factory's inputs / must live next to the constant.

"Single source of coverage" is already satisfied — each type is defined exactly once. A `types/` folder creates a *second* place to look, not eliminates one. The cross-cutting types (`App` in `composition-root.ts`, `ControllerResult` in `controllers/utils.ts`) stay where they are. If discoverability is ever the real goal, `grep -rn "^export interface" apps/mailops/src` gives the catalog, or an optional `types/index.ts` *re-export barrel* (definitions stay put) is the cheap win — not relocation. Revisit only if a concrete pain point surfaces (circular imports between aggregates, a type shared by 3+ unrelated modules).



## Prisma stance

**Prisma 7 is the only ORM. No Drizzle, no raw-SQL layer.** The repository *interfaces* introduced in Phase 1+ exist purely for testability (inject in-memory fakes) and separation of concerns (domain code doesn't import `@prisma/client`). One interface, one Prisma implementation, permanently.

---

## Phase 0 progress — characterization tests

**Goal:** 15 test files (Groups A–O), ~75–90 cases, pinning every mailops feature before any production code moves. Full matrix in [phase-0-characterization-tests.md](./phase-0-characterization-tests.md#coverage-matrix).

**Run:** `npm test -w mailops`

### Group tracker

| Group | Feature | Test file | Cases | Status |
|---|---|---|---|---|
| **A** | Email send (Gmail API) | `email-service.test.ts` | 6 | ✅ done |
| **B** | Tracking (open/click/event + rate math) | `tracking-service.test.ts` | 9 | ✅ done |
| **C** | PubSub inbox sync | `pubsub-handler.test.ts` | 8 | ✅ done |
| **G** | Tracking pixel + click HTTP | `tracking-routes.test.ts` | 12 | ✅ done |
| **F** | Mailbox watch | `mailbox-routes.test.ts` | 7 | ✅ done |
| **E** | Sequence lifecycle | `sequence-controller.test.ts` | 10 | ✅ done |
| **O** | Watch cleanup | `watch-cleanup.test.ts` | 4 | ✅ done |
| **J** | Gmail OAuth client + token refresh | `gmail-client.test.ts` | 4 | ✅ done |
| **I** | Contact sync | `contact-processor.test.ts` | 3 | ✅ done |
| **H** | List sync | `list-sync.test.ts` | 3 | ✅ done |
| **D** | Schedule tick | `schedule-processor.test.ts` | 4 | ✅ done |
| **N** | Rate limiter | `rate-limiter.test.ts` | 4 | ✅ done |
| **K** | Schedule generator (DST/business hours) | `schedule-generator.test.ts` | 6 | ✅ done |
| **M** | Email subject resolution | `email-subject.test.ts` | 10 | ✅ done |
| **L** | Placeholders | `placeholders.test.ts` | 10 | ✅ done |

**Totals:** 15/15 files · **100/~85 cases** · 100 passing · 0 failing · tsc clean · lint clean (warnings only)

### What's pinned so far

**Group A — EmailService.sendEmail (6 cases) ✅**
- Tracked happy-path send: EmailTracking(SENT) + EmailEvent(SENT) + stats + send→get→get→insert→delete sequence
- disableSending shortcut: fake IDs, no Gmail calls, tracking still written
- 401 → throws TOKEN_EXPIRED
- SMTP 535/AUTH XOAUTH2 → throws TOKEN_EXPIRED
- ~1s delay between send and get-details (fake timers)
- Empty html throws "Content and tracking information are required" *(TODO(behavior) for Phase 4b)*

**Group B — Tracking (9 cases) ✅**
- `handleEmailOpen` first open: openCount++, OPENED event isFirstOpen=true, stats isUniqueOpen:true
- `handleEmailOpen` repeat open: STILL creates OPENED event *(current behavior; Phase 4a may change)*
- `handleLinkClick`: LinkClick + TrackedLink.clickCount++ + CLICKED event + stats, returns URL
- `recordEmailOpen` standalone: mirrors class but sets status to lowercase "opened" *(divergence pinned)*
- `createEmailTracking` happy + missing-field throw
- `trackEmailEvent` rate math: all 5 event types with exact expected values
- `trackEmailEvent` no-stats-row → creates initial stats
- `updateTrackingStats` parity: documents that calculateRates path DISAGREES with inline math

**Group C — PubSubHandler.handleNotification (8 cases) ✅**
- Reply → REPLIED event + contact update + stats
- Bounce → BOUNCED event + contact update + stats
- Original message → no event
- Already-processed → skipped
- Large history gap → HISTORY_GAP record, watch historyId updated
- Missing EmailWatch / Mailbox / token → returns early

**Group L — placeholders (10 cases) ✅**
- `replacePlaceholders`: firstName / lastName / name / email from contact
- Falls back to `fallbacks.*` when contact field is empty/missing
- Composes `name` as `'firstName lastName'` (trimmed) when `contact.name` empty
- Replaces remaining unknown placeholders via fallbacks (any key); leaves unknown placeholders in place when no value exists
- Falsy content returned unchanged
- `extractPlaceholders`: deduped + trimmed names; `[]` for falsy/empty content
- `validatePlaceholders`: `[]` when every placeholder has a contact value or fallback; reports names lacking both
- Divergence pinned: empty-string contact field treated as MISSING by `validatePlaceholders` (falsy check), even though `replacePlaceholders` would substitute `""`

### Harness built (reusable)

- `vitest.config.ts` — node env, globals, `@/` alias, coverage config
- `src/__tests__/setup.ts` — dummy env vars (so `config/env.ts` zod validation passes at import)
- `src/__tests__/helpers/fake-prisma.ts` — in-memory Prisma stub (create/update/updateMany/findUnique/findFirst/findMany/count/upsert/delete/deleteMany/$transaction + nested relation writes + unique-field registration)
- `src/__tests__/helpers/fake-gmail.ts` — canned gmail_v1.Gmail (send/get/insert/delete/threads.get) + makeFakeFetch
- `src/__tests__/helpers/test-context.ts` — vi.mock wiring for @coldjot/database, @/lib/google, @/lib/google/gmail/helper, @/lib/stats via vi.hoisted

---

## Phase 3 progress — repositories isolate Prisma

**Goal:** every `prisma.*` call lives behind a repository. Domain code depends on `*Repository` interfaces, not `@coldjot/database`. See [phase-3-repositories.md](./phase-3-repositories.md).

**Sub-branch:** `refactor/mailops-phase-3-repos` (off `refactor/mailops`, **merged `--no-ff` at `4d6571d`**).

**Run:** `npm test -w mailops` → 16 files / 102 tests. `npx tsc --noEmit -p apps/mailops/tsconfig.json` → clean. `npm run lint -w mailops` → 0 errors (8 `@coldjot/database` warnings remain — all Phase 4/5 residuals; see below).

### Aggregate tracker

| Step | Aggregate | Status | Commit |
|---|---|---|---|
| 3.1 | EmailTracking | ✅ done | `0109a4c` |
| 3.2 | EmailEvent | ✅ done | `d0cab22` |
| 3.3 | TrackedLink + LinkClick (non-tx) | ✅ done | `0371d11` |
| 3.4 | SequenceStats | ✅ done | `6e7a5f5` |
| 3.5 | SequenceContact (non-pubsub) | ✅ done | `63b9123` |
| 3.6 | Sequence + SequenceStep + BusinessHours | ✅ done | `d98f3a9` |
| 3.7 | Mailbox (+ aliases + SequenceMailbox) | ✅ done | `c07f3b9` |
| 3.8 | EmailThread | ✅ done | `b9ff61d` |
| 3.9 | EmailWatch + EmailWatchHistory + ProcessedMessage + pubsub's deferred SequenceContact/EmailThread/Mailbox | ✅ done | `af04e84` |
| 3.10 | Template + Contact + EmailList + ListSyncRecord | ✅ done | `f58b80c` |
| final | promote `no-restricted-imports` warn → error; merge to `refactor/mailops` | ⏸️ **Merge done** (`4d6571d`); **lint promotion deferred to Phase 4** — 8 residuals are `$transaction` tx clients, SMTP path, sequenceHealth (not 3.x scope) | `4d6571d` |

### What's been migrated (3.1–3.10 — ALL aggregates done)

Direct `prisma.<model>.*` calls have been replaced with repository method calls in:
- `lib/email/index.ts`, `lib/tracking/index.ts` (standalone fns + TrackingService class — `$transaction` tx-client calls remain, Phase 4a), `lib/stats/index.ts` (`$transaction` tx client remains, Phase 4), `lib/schedule/index.ts`
- `lib/mailbox/index.ts` (standalone fns — module-level repo singleton), `lib/email-subject.ts` (emailThread + emailTracking + template), `lib/google/gmail/gmail.ts` (GmailClientService)
- `controllers/sequence.controller.ts` (sequence + businessHours; sequenceHealth residual), `controllers/mailbox.controller.ts`, `controllers/list.controller.ts`
- `services/jobs/{email,schedule,contact,sequence,list}/` (processor.ts + helper.ts)
- `services/jobs/thread-watch/processor.ts` (emailThread calls; emailEvent + sequenceContact residuals are 3.2/3.5 misses)
- `services/monitor/service.ts`
- `services/pubsub/handler.ts` (EmailEvent + Mailbox + EmailThread + EmailWatch + EmailWatchHistory + SequenceContact)
- `services/pubsub/helper.ts` (EmailThread + EmailWatch + EmailWatchHistory + ProcessedMessage + SequenceContact + Sequence)
- `services/watch/index.ts` (Mailbox + EmailWatch), `services/watch/cleanup.ts`, `services/watch/debug.ts`

### Files still importing `@coldjot/database` (8 residuals — all Phase 4/5 scope)

Phase 3 migrated every domain aggregate. The 8 remaining imports are NOT domain-model calls — they're either `$transaction` tx-client usage (needs the raw prisma client for atomicity), the SMTP path (deleted in Phase 4b), or monitor-only models left out of the repo set:

```
controllers/sequence.controller.ts      ← sequenceHealth in resetSequence (monitor-only model; decide in Phase 4/5)
lib/google/smtp/gmail.ts                ← SMTP path; Phase 4b deletes this file entirely
lib/stats/index.ts                      ← $transaction tx client (Phase 4 collapses the divergent rate-math)
lib/tracking/index.ts                   ← $transaction tx client (Phase 4a deletes the standalone fns)
services/jobs/schedule/processor.ts     ← sequenceHealth in resetSequence (same as controller)
services/jobs/sequence/helper.ts        ← sequenceHealth in resetSequence (same as controller)
services/jobs/thread-watch/processor.ts ← emailEvent + sequenceContact calls (3.2/3.5 misses; sweep up in Phase 4/7)
services/monitor/service.ts             ← sequenceStats.create in init (monitor-only; Phase 6 unwinds ServiceManager)
```

**Why the lint rule stays at `warn`:** Flipping `no-restricted-imports` to `error` would break the build on these 8 files. They're out of Phase 3's scope by design (per the locked decisions: `$transaction` blocks stay on the tx client until Phase 4; SMTP is deleted in Phase 4b; `sequenceHealth` is monitor-only). The rule promotes to `error` once Phase 4 collapses the tx-client paths and Phase 4b deletes SMTP. The warning count dropping 22 → 8 across Phase 3 is the progress signal.

**Note:** `lib/google/account/google-account.ts` no longer imports `@coldjot/database` (dead import removed in 3.7 — it only ever called `lib/mailbox` helpers, which were migrated).

### Key decisions made during 3.1–3.6 (read before resuming)

1. **Injection pattern:** BullMQ processors (`EmailProcessor`, `ScheduleProcessor`, `ContactProcessor`) and legacy singletons (`emailService`, `trackingService`) aren't constructed via `createApp()`. Used **private-field-with-default-Prisma-repo** injection (`private readonly foo = new PrismaFooRepository()`) — overridable for tests, no behavior change. Full DI through `createApp()` lands in Phase 6 when `ServiceManager` is unwound. Do NOT try to thread these through the composition root yet.
2. **Standalone-function stopgap in `lib/tracking`:** module-level repo singletons (`emailTrackingRepo`, `emailEventRepo`, `trackedLinkRepo`, `linkClickRepo`, `sequenceStatsRepo`) bridge the standalone fns (`createEmailTracking`, `recordEmailOpen`, etc.) until Phase 4a deletes them. **Don't extend this pattern to other files** — for classes, use the private-field pattern.
3. **`$transaction` blocks left on the tx client:** the `linkClick`/`trackedLink` writes inside `lib/tracking`'s `$transaction(async (prisma) => ...)` blocks still call `prisma.linkClick.create` / `prisma.trackedLink.update` / `prisma.emailTracking.update` on the **tx client** (not the repo) — they need atomicity. Phase 4a collapses these. Same for `lib/stats/index.ts`'s `updateSequenceStats` `$transaction`.
4. **`sequenceStats.updateRaw` + `createWithValues`:** added as escape hatches for the legacy inline rate-math paths (`trackEmailEvent`, `updateTrackingStats`). Phase 4 collapses the divergent rate-math into `updateCounts` and removes these methods.
5. **Fake-prisma fix:** `handleCreate` in `__tests__/helpers/fake-prisma.ts` was patched so a passed `id: undefined` doesn't shadow the generated UUID (`{ id: randomUUID(), ...args.data, ...(args.data?.id ? { id: args.data.id } : {}) }`). Without this, repo `createPending` calls that omit `id` returned `undefined` ids in tests.
6. **`SequenceWithDetails` type** keeps BOTH `sequenceMailboxId` (new) and `sequenceMailbox` (legacy nested) so `services/jobs/sequence/processor.ts`'s cast still works. Phase 4 cleans this up.
7. **`sequenceHealth`** model is NOT in the repository set (monitor-only). Calls in `resetSequence` (`services/jobs/sequence/helper.ts`) and `services/jobs/schedule/processor.ts` remain on `prisma.sequenceHealth`. Decide in 3.9/3.10 whether to add a repo or leave it.

### Key decisions made during 3.7–3.8 (read before resuming)

8. **`SequenceMailbox` joined into the Mailbox repo** (not its own repo). It's a join table binding Mailbox+Alias to a Sequence, with only 3 read call sites, all in `lib/mailbox/index.ts`. Added `findSequenceMailboxId` / `findSequenceMailboxById` / `findSequenceMailbox` to `MailboxRepository` so `lib/mailbox` no longer imports `@coldjot/database`.
9. **`MailboxRecord` type gaps fixed:** added `name`, `providerAccountId`; `expires_at` retyped `number | null` (was incorrectly `Date | null` — schema is `Int?`, all consumers treat as epoch seconds). `MailboxAliasRecord` introduced (field is `alias`, not `email` — Phase 1 had it wrong).
10. **`findActiveGmailByEmail(email)`** added — `services/watch/index.ts` queries mailbox by email alone (no userId on hand). The existing `findActiveGmail(userId, email)` is the controller's path.
11. **`updateTokens(id, accessToken, expiresAtMs)`** — renamed param to `expiresAtMs` to make the unit explicit; the impl divides by 1000 (schema stores seconds, callers pass ms).
12. **`EmailThread.updateCheckMetadata`** collapses the thread-watch metadata write: takes `(threadId, lastCheckedAt, metadata)` and writes both fields. The original called `new Date()` twice (once for the column, once for the ISO string in metadata); the migrated version uses a single `now` — atomic and more correct.
13. **`EmailThread.markCompleted`** now takes `existingMetadata` to merge (thread-watch spreads prior metadata into the COMPLETED blob).
14. **`EmailThread.findManyForChecking(where, take)`** accepts a `Record<string, unknown>` where (built by the caller — age + lastCheckedAt tiers). Kept loose-typed rather than leaking `Prisma.EmailThreadWhereInput` into the repo interface.
15. **Module-level repo singleton extended to `lib/email-subject.ts` + `services/pubsub/helper.ts`** (both standalone-fn files). This is a controlled extension of the 3.1 `lib/tracking` stopgap — same justification (Phase 4 turns these into services). The `lib/mailbox` standalone fns use the same pattern.
16. **Residual 3.1/3.2 misses found in 3.8:** `lib/email-subject.ts` had two `emailTracking` calls (`count`, `findFirst`) not migrated in 3.1 — migrated them now via existing repo methods (`countByThread`, `findEarliestSubjectInThread`). `services/jobs/thread-watch/processor.ts` still has `emailEvent` + `sequenceContact` calls (3.2/3.5 misses) — left for now since they're out of 3.8's scope; flag for sweep-up.
17. **`WatchWithMailbox`** in `services/pubsub/handler.ts` now references `MailboxWithAliases` (from the repo interface) instead of `@prisma/client`'s `Mailbox` & `EmailAlias` types. Dropped the unused `Prisma` import.

### Key decisions made during 3.9–3.10 (read before resuming)

18. **`markTerminalBySequenceContact` returns `{count: number}`** — the pubsub bounce/reply handlers read `updateResult.count` for logging. Changed the return type from `void` and `return` the `updateMany` result.
19. **`EmailWatchRecord` gained `createdAt` + `updatedAt`** — `services/watch/debug.ts`'s `testWatchRenewalProcess` reads `updatedWatch.updatedAt` to detect renewal. The fields exist on the schema; Phase 1's interface omitted them.
20. **`pubsub/handler.ts` createNotificationRecord** now generates the `nanoid()` upfront (`recordId`) and returns `{ id: recordId }` instead of relying on the repo's `create` return (which is `void`). The original read `record.id` from the returned Prisma row; the repo no longer returns the row, so the id is captured pre-call. Behavior preserved.
21. **`pubsub/handler.ts` markNotificationProcessed** dropped the dead `return result` (private fn, never called; repo `markProcessed` returns void).
22. **`pubsub/handler.ts` sequenceContact.update by id** (~line 1258) → `updateBySequenceAndContact` (composite unique identifies the same row as the id). The `updateBySequenceAndContact` impl sets `completedAt: new Date()` when `completed === true`, so dropping the explicit `completedAt` from the call is behavior-preserving.
23. **`thread-watch/processor.ts:687` sequenceContact.updateMany left as residual** — it's a status-only bulk update (sets `status: BOUNCED` without `completed`/`completedAt`/`nextScheduledAt`), which doesn't fit `markTerminalBySequenceContact` (that always sets the full terminal markers). Adding a separate method for one call site isn't worth it; sweep up in Phase 4/7.
24. **`ListRepository` extended** with `findWithSequences(listId)` + `findContactsPage(listId, take, skip)` — the list-sync helper paginates contacts in `BATCH_SIZE` chunks. `contactCount(listId)` kept (processor sorts by it via `listSyncRecord.include.list._count`).
25. **`ListSyncRecordRepository.updateStatus`/`updateStatusByListSequence`** `error` param widened to `string | null` — the helper's `updateSyncRecordStatus` defaults `error` to `null` (not `undefined`).
26. **`ContactRecord` retyped** — added `userId`/`createdAt`/`updatedAt` (consumers pass the contact to functions expecting the full shape); `firstName`/`lastName`/`name` changed from `| null` to required `string` (schema has them as `String`, not `String?` — Phase 1 had them wrong).
27. **Lint rule promotion deferred to Phase 4.** The plan's "final commit" step says flip `no-restricted-imports` to `error` once warning count hits zero. It's at 8, not zero — all residuals are `$transaction` tx clients, SMTP path, or `sequenceHealth` (monitor-only), none of which are Phase 3 scope. Promoting now would break the build. The rule flips to `error` after Phase 4 collapses the tx-client paths and Phase 4b deletes SMTP.
28. **`pubsub/helper.ts` module-level repo singletons extended** to emailWatch/emailWatchHistory/processedMessage/sequenceContact/sequence — same stopgap pattern as `lib/tracking` and `lib/email-subject`. Phase 4 turns these standalone fns into proper services with constructor injection.

### Per-step recipe (unchanged from the plan doc)

For each remaining aggregate (3.7–3.10):
1. `grep -rn "prisma\.<model>\." apps/mailops/src` → confirm matching repo method exists; add if missing.
2. Inject the repo (private-field-with-default for classes; module-level singleton ONLY for `lib/tracking`'s standalone fns).
3. Replace each call site, diff line-by-line.
4. `npm test -w mailops` must stay 102/102 green.
5. Commit: `phase 3.N: migrate <Aggregate> call sites to repository`.

### Resume commands

Phase 3 is **done and merged**. To start Phase 4:

```bash
cd "/Volumes/Data/00-My Projects/ColdJot/coldjot"
git checkout refactor/mailops                         # Phase 3 merged here at 4d6571d
npm test -w mailops                                   # 102/102 passing
npx tsc --noEmit -p apps/mailops/tsconfig.json        # clean
git checkout -b refactor/mailops-phase-4-split        # branch off refactor/mailops tip
# Next: Phase 4 (split three god-objects). See phase-4-split-god-objects.md.
```

---

## Phase 4 progress — split three god-objects

**Goal:** break `lib/tracking/index.ts`, `lib/email/index.ts`, `services/pubsub/handler.ts` into layered, single-responsibility pieces. See [phase-4-split-god-objects.md](./phase-4-split-god-objects.md). **Done — 4a (tracking) + 4b (email) + 4c (pubsub) all merged.**

**Sub-branches:** `refactor/mailops-phase-4-split` (4a, merged `--no-ff` at `44e55df`), `refactor/mailops-phase-4b-email` (4b, merged `--no-ff` at `40fe9d2`), and `refactor/mailops-phase-4c-pubsub` (4c, merged `--no-ff`) into `refactor/mailops`.

**Baseline (verified post-4c merge):** `npm test -w mailops` → 16 files / **98 tests passing**. `npx tsc --noEmit -p apps/mailops/tsconfig.json` → **clean**. `npm run lint -w mailops` → **0 errors, 260 warnings** (7 domain-code `@coldjot/database` residuals — see "Lint stance" below).

### Step tracker

| Step | Target | Status | Commit |
|---|---|---|---|
| 4a.1 | Isolate pure helpers (pixel.ts, link-wrap.ts, stats.ts) | ✅ done | `30c1bdf` |
| 4a.2 | Move TrackingServiceImpl → services/domain/tracking.service.ts (constructor-injected repos) | ✅ done | `7266935` |
| 4a.3 | Delete dead standalone `trackEmailEvent` + `updateTrackingStats` + cases 6/6b/7 | ✅ done | `3cdb926` |
| 4a.4 | Delete remaining dead standalones (recordEmailOpen/recordLinkClick/getEmailEvents/getSequenceEvents) + case 4 | ✅ done | `b00d7f2` |
| 4a.5 | Migrate `createEmailTracking` → `TrackingServiceImpl.createTracking`; update EmailProcessor + cases 5a/5b | ✅ done | `2c898dc` |
| 4b.1 | Extract GmailTransport (`adapters/gmail-transport.ts`); move getSentDetails body | ✅ done | `85fb7ad` |
| 4b.2+4b.3 | Extract `SendEmailServiceImpl`; migrate EmailProcessor + composition-root | ✅ done | `e5532d7` |
| 4b.4 | Delete EmailService + `lib/google/smtp/*` + nodemailer; clean lib/tracking barrel | ✅ done | `8cb9f92` |
| 4c.1 | Extract `GmailInboxSource` (adapters/gmail-inbox-source.ts); handler delegates | ✅ done | `ec7a009` |
| 4c.2 | Extract `classify.ts` (predicates + determineNotificationType + history-gap); utils/email re-exports | ✅ done | `325ce1b` |
| 4c.3 | Extract `states.ts` (nextContactStatus) | ✅ done | `72b4baa` |
| 4c.4 | Extract `apply-classification.ts` (dedupe processBounce + processReply) | ✅ done | `7b8f760` |
| 4c.5 | Write `InboxSyncServiceImpl` (flat orchestrator); Group C tests point at it | ✅ done | `d5e57fa` |
| 4c.6 | Swap client.ts + composition-root + routes/pubsub.ts to InboxSyncServiceImpl; delete handler.ts + helper.ts; extract decode/records helpers | ✅ done | `39339fd` |
| 4c.7 | ThreadProcessor left alone (Phase 5 deletes it) | ✅ done (no-op) | — |

### What 4a produced

**`lib/tracking/` now:**
- `pixel.ts` (17 lines) — pure `generateTrackingPixel`.
- `link-wrap.ts` (112 lines) — pure `wrapLinksWithTracking` + `addTrackingToEmail` (with `createLink` injected as a callback).
- `stats.ts` (38 lines) — pure `calculateRates` (single source of truth for rate math).
- `index.ts` (24 lines) — clean barrel re-exporting the `TrackingServiceImpl`/`trackingService` from `services/domain/` + the pure helpers. (At end of 4a this still held a `createTrackedLink` + no-callback `addTrackingToEmail` shim; 4b deleted both once the live caller moved to the pure version.)

**`services/domain/tracking.service.ts` (284 lines)** — interface + `TrackingServiceImpl` (the canonical open/click/event + `createTracking` path). Constructor-injected repos with Prisma defaults (the Phase 3 private-field-with-default pattern). The `$transaction` block in `handleLinkClick` stays on the tx client (collapses later — flagged residual).

**Dead code removed:** standalone `recordEmailOpen`, `recordLinkClick`, `trackEmailEvent`, `updateTrackingStats`, `getEmailEvents`, `getSequenceEvents` — all had zero live callers. The two divergent rate-math paths were deleted, not reconciled (per plan). Test count: 102 → 98 (4 dead-code characterization cases removed: 4, 6, 6b, 7).

### Key decisions made during 4a (read before resuming)

1. **`TrackingServiceImpl` uses constructor injection with Prisma defaults** (`new PrismaEmailTrackingRepository()`, `new PrismaEmailEventRepository()`). This keeps `new TrackingServiceImpl()` working for the characterization tests (the test harness mocks `@coldjot/database`) AND lets `createApp()` pass real repos later. Phase 6 threads this through `createApp()` properly.
2. **`lib/tracking/index.ts` stays a barrel re-exporting `TrackingServiceImpl as TrackingService` + `trackingService`** under the legacy names. The route controller (`controllers/tracking.controller.ts`) still imports `trackingService` from `@/lib/tracking` — that resolves to the new singleton. Migrating the controller import to `@/services/domain/tracking.service` is cosmetic; deferred to Phase 6 when it's constructor-injected.
3. **`addTrackingToEmail` has TWO surfaces now:** the pure `addTrackingToEmail` in `link-wrap.ts` (takes a `createLink` callback) and a no-callback backwards-compat wrapper in `index.ts` (binds the module-level `trackedLinkRepo`). The wrapper is deleted in 4b when the email service (its only caller) is split.
4. **`createTracking` body is the cleaned-up `createEmailTracking`** — dropped the dead `eventData` local (the repo call reconstructed it anyway) and the `console.error`. Behavior identical: same `createPending` payload, same returned `EmailTracking` shape. Cases 5a/5b pass against the new method unchanged.
5. **`lib/tracking/helper.ts` is dead** (`generateTrackingMetadata` has zero callers). Left in place — Phase 5 sweeps dead code. Its `console.log` is the only `console.*` in the tracking directory outside the two shim `console.error`s in `index.ts`.
6. **Lint at end of 4a:** 8 `@coldjot/database` warnings (unchanged from Phase 3, but `lib/tracking/index.ts` dropped out and `services/domain/tracking.service.ts` joined — the `$transaction` tx-client for `handleLinkClick`). 4b dropped the count to 7 by deleting the SMTP path; see the 4b section below.

### What 4b produced

**`adapters/gmail-transport.ts` (87 lines)** — `GmailTransport implements MailTransport`. Each method fetches its own client via `gmailClientService.getClient(userId, mailboxId)` (option a in the plan); the client service caches OAuth tokens so the per-call cost is one cache lookup. `send`/`insert`/`delete`/`getSentDetails` carry `(userId, mailboxId)` so the transport is self-contained. `getSentMessageDetails` body moved here verbatim.

**`services/domain/send-email.service.ts` (245 lines)** — interface + `SendEmailServiceImpl`. The body is the Gmail-API path only: `useApi` toggle, SMTP branch, the stray `null;`, the unused `createEmailTrackingRecord`, and `handleSendEmailError` (a one-line logger) are all gone. Constructor takes `(transport, emailTracking repo, trackedLink repo)` with Prisma/Gmail defaults. Uses the pure `addTrackingToEmail` (link-wrap) with `trackedLink.create` injected as the `createLink` callback.

**Deleted:** `lib/email/index.ts` (entire file — `EmailService` class + singleton), `lib/google/smtp/{gmail,helper,nodemailer}.ts` (~530 lines), `sendGmailSMTP`/`smtp/helper` re-exports, `nodemailer` + `quoted-printable` (+ types) from package.json. `lib/tracking/index.ts` collapsed to a clean 24-line barrel (the no-callback `addTrackingToEmail` shim + `createTrackedLink` + the `trackedLinkRepo` singleton + their two `console.error`s all gone — the live caller uses the pure version now).

**Lint:** `@coldjot/database` warnings **8 → 7** (`lib/google/smtp/gmail.ts` gone); total warnings **304 → 271**. Group A characterization (5 cases, all 5 event-types + disableSending + auth-failure + delay + empty-html) passes against `SendEmailServiceImpl.send` unchanged.

### Key decisions made during 4b (read before resuming)

1. **`MailTransport` methods take `(userId, mailboxId)`** so the transport fetches its own client per call (option a). The orchestrator still calls `transport.getClient` once for the helpers that need a raw gmail handle (`getEmailThreadInfo`, `createUntrackedMessage` — they predate the transport and take a `gmail` arg).
2. **Fake-gmail memoization:** `test-context.ts` now reuses ONE fake gmail per test (mirroring the real client cache), and `fake-gmail.ts` reads canned responses LAZILY (at call time, not construction). Without both, Phase 4b's per-method `getClient` calls each returned a fresh fake with its own empty `calls` array, AND test-time response overrides weren't picked up. Tests now assert the full `["send","get","get","insert","delete"]` sequence again.
3. **`SendEmailServiceImpl.recordSentEvent` is `async` and awaited** (not fire-and-forget) to preserve the exact timing of the original `await this.createEmailEvent(...)` — the `disableSending` path's stats call must resolve before `send` returns (Group A case 2 asserts on `ctx.stats`).
4. **`lib/email/helper.ts` stays standalone** — the pure RFC822 builders (`createEmailMessage`, `createUntrackedMessage`, `generateSenderInfo`) are imported by `SendEmailServiceImpl` from `@/lib/email/helper`. Only `lib/email/index.ts` (the class) was deleted.
5. **`SendEmailService` interface moved** from its own 9-line file into `send-email.service.ts` (interface + impl together, matching how 4a organized tracking.service.ts).
6. **`lib/tracking/helper.ts` still dead** (`generateTrackingMetadata`, zero callers). Phase 5 sweeps it.

### Resume guide — Phase 4 is DONE; Phase 5 is next

**Where we are:** 4a + 4b + 4c all merged into `refactor/mailops`. All three god-objects (`lib/tracking`, `lib/email`, `services/pubsub/handler`) are split into small services + pure helpers + adapters. Phase 4 is complete. **Phase 5 (dead code cleanup) is next** — it deletes the dormant ThreadProcessor, `lib/tracking/helper.ts`, the `utils/email.ts` re-export shim (once thread-watch is gone), and the `pubsub-handler.test.ts`/`__tests__` cruft that only the legacy class needed.

```bash
cd "/Volumes/Data/00-My Projects/ColdJot/coldjot"
git checkout refactor/mailops
npm test -w mailops                                    # 16 files / 98 tests passing
npx tsc --noEmit -p apps/mailops/tsconfig.json         # clean
npm run lint -w mailops                                # 0 errors, 260 warnings

git checkout -b refactor/mailops-phase-5-cleanup       # branch off refactor/mailops tip
```
Then open [phase-5-dead-code-cleanup.md](./phase-5-dead-code-cleanup.md).

### What 4c produced

**Final structure (all under `apps/mailops/src/`):**
```
adapters/gmail-inbox-source.ts        (183) GmailInboxSource implements InboxSource — Gmail REST + OAuth
services/inbox-sync/classify.ts        (285) pure predicates + determineNotificationType + history-gap math
services/inbox-sync/states.ts           (28) nextContactStatus (REPLY→REPLIED, BOUNCE→BOUNCED, else null)
services/inbox-sync/apply-classification.ts (114) EmailEvent write + SequenceContact terminal + stats (deduped bounce/reply)
services/inbox-sync/records.ts         (144) dedupe + watch-history writes (repo-injected)
services/inbox-sync/decode.ts           (66) decodeNotification + sanitizeData (pure)
services/domain/inbox-sync.service.ts  (388) InboxSyncServiceImpl — flat orchestrator
```

**Deleted:** `services/pubsub/handler.ts` (1,308 lines — the `PubSubHandler` god-class) + `services/pubsub/helper.ts` (454 lines — the standalone-fn stopgap from Phase 3.9). The pubsub dir now contains only `client.ts` (the GCP push-subscription service).

**Call sites swapped:** `routes/pubsub.ts` (the real runtime webhook) + `composition-root.ts` (wired behind `InboxSyncService`, repos constructor-injected) + `services/pubsub/client.ts` (dropped the dead `messageHandler` field — push subscription never read it).

**`utils/email.ts` is now a re-export shim** for the 5 inbox-sync predicates (canonical home: `classify.ts`). It stays only because `services/jobs/thread-watch/processor.ts` imports them via the `@/utils` barrel — Phase 5 deletes thread-watch, then this shim can go too.

**Test wiring unchanged:** the Group C characterization tests (8 cases) still mock global `fetch` + `@/lib/google/gmail/helper`'s `refreshTokenIfNeeded` + `@coldjot/database`. They characterize `InboxSyncServiceImpl` end-to-end through those same boundaries — the only edit was swapping `new PubSubHandler()` → `new InboxSyncServiceImpl()`.

### Key decisions made during 4c (read before resuming)

1. **`GmailInboxSource` calls the same globals the tests mock**, so 4c.1–4c.4 needed zero test edits. The plan suggested updating the Group C tests to mock `InboxSource` directly in 4c.1; turned out unnecessary — `InboxSource` is implemented against the same `fetch` + `refreshTokenIfNeeded` the harness stubs. The single test edit landed in 4c.5 (the constructor swap), not 4c.1.
2. **`determineNotificationType` is pure via injection.** The canonical classifier in `classify.ts` takes `hasOriginalForThread: (threadId) => Promise<boolean>` as a parameter so the module stays free of repo imports. The orchestrator binds it to `processedMessageRepo.hasOriginalForThread`. The 4c.2 wrapper in `helper.ts` (now deleted) preserved the old 3-arg signature for the live handler until 4c.5.
3. **`applyClassification` takes `{ change, deps }`** (not the plan's `{ change, emailThread, repos }`). The thread lookup happens inside the function (matches the originals) so the orchestrator's per-message loop doesn't need a separate `emailThread.findByThread` call before dispatch. The orchestrator passes `emailEvent`/`sequenceContact`/`emailThread` repos via `deps`.
4. **The `updateSequenceStatuses` second pass is dropped** (the orchestrator doesn't call it). It was a provable no-op: for BOUNCE/REPLY, `applyClassification` already marks the contact terminal → `canUpdateSequenceContact` returns false; for ORIGINAL/MESSAGE_ADDED, `nextContactStatus` returns null. It never updated a row. Group C cases 1 + 2 (which exercise both paths) pass unchanged.
5. **`utils/email.ts` re-exports rather than moves.** The plan offered "leave + re-export OR move" — chose move (canonical home `classify.ts`) with a re-export shim, because thread-watch still imports the predicates via the `@/utils` barrel and Phase 5 deletes thread-watch. New code imports from `@/services/inbox-sync/classify`.
6. **`processHistory` preserves the null/throwing-fetch → `handleLargeHistoryGap` fallback.** The original treated a missing history response the same as a large gap; `InboxSyncServiceImpl` does too (try/catch around `inboxSource.fetchHistory` + a null check, both → `handleLargeHistoryGap`).
7. **`P2002` (unique-constraint) tolerance in `createProcessedMessageRecord`** is preserved — the helper swallows `error.code === "P2002"` (message already recorded) and re-throws everything else. Matched the original's `Prisma.PrismaClientKnownRequestError` check; the new version checks `.code` directly (the fakes set `.code`).
8. **`InboxSyncServiceImpl` is 388 lines, not ≤150** (the plan's aspirational target). The bulk is the constructor's 8 default-Prisma params + the rich file-logging the original carried + 6 flat orchestration methods. Factored `records.ts` + `decode.ts` out to keep it under 400 and the pipeline readable. Further reduction would mean stripping logging (behavior change) or splitting the constructor (premature) — deferred. The god-object's 1,308 → 388 (+ 6 small modules) is the win.
9. **The lint rule did NOT flip to `error`** after 4c. The 7 domain-code residuals are unchanged (none were 4c scope): `thread-watch/processor.ts` is now the only "Phase 4c sweep" candidate left, and 4c.7 deliberately left it for Phase 5. The rule flips after Phase 5 deletes thread-watch + Phase 7 collapses the `$transaction` tx-client paths.

### Lint stance (Phase 4 residuals — unchanged by 4c)

7 domain-code files still import `@coldjot/database` directly (down from Phase 3's 8 — 4b removed `lib/google/smtp/gmail.ts`; 4c removed none since none were 4c scope):

```
controllers/sequence.controller.ts          ← sequenceHealth (monitor-only; Phase 5/6 decision)
lib/stats/index.ts                          ← $transaction tx client (Phase 7 collapses the rate math)
services/domain/tracking.service.ts         ← $transaction tx client in handleLinkClick (Phase 7)
services/jobs/schedule/processor.ts         ← sequenceHealth in resetSequence (same as controller)
services/jobs/sequence/helper.ts            ← sequenceHealth in resetSequence (same as controller)
services/jobs/thread-watch/processor.ts     ← emailEvent + sequenceContact (3.2/3.5 misses; Phase 5 deletes the file)
services/monitor/service.ts                 ← sequenceStats.create in init (Phase 6 unwinds ServiceManager)
```
The rule flips to `error` **after** Phase 5 deletes thread-watch AND Phase 7 collapses the tx-client paths. Don't flip it before then — it would break the build on these 7 files. (The Prisma repo impls under `repositories/prisma/**` import `@coldjot/database` legitimately — they're the ORM layer — and the eslint rule already ignores them.)

---

## Phase 5 progress — dead code cleanup

**Goal:** remove the leftover scaffolding, comment noise, dead files, stray logs, and unused deps that survived Phases 1–4. See [phase-5-dead-code-cleanup.md](./phase-5-dead-code-cleanup.md). **Done — all 7 steps merged.**

**Sub-branch:** `refactor/mailops-phase-5-cleanup` (merged `--no-ff` into `refactor/mailops`).

**Baseline (verified post-Phase-5 merge):** `npm test -w mailops` → 16 files / **98 tests passing**. `npx tsc --noEmit -p apps/mailops/tsconfig.json` → **clean**. `npm run lint -w mailops` → **0 errors, 244 warnings** (was 260 after Phase 4; 271 at Phase 4 start).

### Step tracker

| Step | What | Status | Commit |
|---|---|---|---|
| 5.1 | Delete orphaned/dead files | ✅ done | `7a4efc2` |
| 5.2 | Remove comment-separator noise + commented-out blocks | ✅ done | `92ee07c` |
| 5.3 | Replace console.log/error with logger; delete PII + noise logs | ✅ done | `631ca82` |
| 5.4 | Delete unused validateEmailData private method | ✅ done | `cb3c363` |
| 5.5 | (no-op — tracking barrel was already clean; helper.ts deleted in 5.3) | ✅ done | — |
| 5.6 | Tighten any-types introduced in Phase 4c | ✅ done | `981e49e` |
| 5.7 | Remove unused deps (openai, uuid, @types/uuid) | ✅ done | `ec73923` |

### What got deleted / changed

**Files deleted (5):**
- `services/init.ts` (55 lines) — orphaned; `server.ts` calls `createServiceManager()` directly.
- `services/jobs/thread-watch/processor.ts` (846 lines) — the dormant ThreadProcessor; commented out in `service-manager.ts`, zero live callers. `InboxSource` is the future seam for any polling impl.
- `services/watch/debug.ts` (330 lines) — dev-only `WatchDebugService`; only referenced by commented-out re-exports.
- `lib/google/helper.ts` (1-line re-export shim) — `send-email.service.ts` now imports `getEmailThreadInfo` from `@/lib/google/gmail/helper` directly.
- `lib/tracking/helper.ts` — dead (`generateTrackingMetadata` had zero callers).

**Comment noise:** stripped 149 `// ---...` separator lines across 10 files; deleted duplicated commented-out re-export cruft in `watch/index.ts`, dead usage-example block in `watch/cleanup.ts`, dead `RateLimitType` alias in `config/redis/keys.ts`.

**Console sweep:** every `console.log/error/warn` converted to pino `logger` (object-first form) or deleted. The PII log at `services/jobs/email/processor.ts:139` (logged full `EmailJob` data) was **deleted, not converted** per the plan. The one remaining `console.error` in `lib/log/file-logger.ts` is marked `// intentional` — it's the logger's own last-resort stderr fallback (routing through pino would risk recursion). Also deleted a stray `console.log(userId)` that leaked the user id.

**Deps removed:** `openai` (used by `apps/web`, not mailops — stray), `uuid` + `@types/uuid` (mailops uses `nanoid`). The SMTP trio (`nodemailer`/`quoted-printable`/`mailcomposer`) was already gone after 4b.

**`any` tightening (5.6, surgical):** the `isValidNotification(data: any)` guard → `unknown` with a `Record<string, unknown>` narrowing; `catch (error: any)` in `records.ts` → `catch (error)` with an `isPrismaUniqueConstraintError(error: unknown)` helper; `metadata as any` in `apply-classification.ts` → typed `EmailEventMetadata`; `createOrUpdateWatchHistory`'s `data: any` → `Record<string, unknown>`. The broader 182 `no-explicit-any` warnings across mailops are pre-existing and out of Phase 5 scope — Phase 7's type-safety pass handles those. Left as-is (faithful to originals): `sanitizeData(data: any): any` (generic log redactor) and the Gmail JSON `as any` cast in `gmail-inbox-source.ts`.

### Key decisions made during Phase 5 (read before resuming)

1. **`lib/google/index.ts` + `lib/google/gmail.ts` are NOT shims** — the plan guessed they'd be re-export shims after 4b/4c, but they hold the live `GmailClientService` + `getGmailSubject` (used by `email-subject.ts`). Only `lib/google/helper.ts` was a true shim (1-line re-export) — that one's deleted.
2. **`THREAD_WATCHER` queue config stays** — deleting `thread-watch/processor.ts` removed the consumer, but the queue name/registration in `config/queue/index.ts` (4 spots) is frozen BullMQ topology (the plan's "What does NOT change" list). It's now harmless dead *config*, not dead code in `src/`.
3. **`lib/tracking/index.ts` was already clean** — the plan's 5.5 target barrel shape (no stopgap setters) was already achieved by 4a. The stopgap setters `_setTrackingRepo`/`_setTrackingRepos` the plan mentions didn't exist anymore. 5.5 reduced to deleting `helper.ts` (done in 5.3).
4. **The lint rule did NOT flip to `error`** — still 7 domain-code residuals (now 6 after thread-watch deletion; the `sequenceHealth` + `$transaction` paths remain for Phase 6/7). The rule flips after Phase 6 unwinds ServiceManager + Phase 7 collapses the tx-client paths.
5. **Lint warning count: 271 → 244** across Phase 4+5. Most of the drop came from deleting dead files (handler/helper/init/thread-watch/debug) + the dep removal. The remaining 244 are pre-existing `no-explicit-any` (182) + other style warnings — Phase 7 territory.

### Resume guide — Phase 5 is DONE; Phase 6 is next

**Where we are:** Phases 0–5 all merged into `refactor/mailops`. **Phase 6 (kill ServiceManager singleton) is next** — it unwinds the `ServiceManager.getInstance()` wrapper, wires `createApp()` into `server.ts`, and constructor-injects the domain services (the last piece before the Phase 7 test suite). After Phase 6, the `no-restricted-imports` lint rule can flip to `error` (most residuals resolve when ServiceManager goes).

```bash
cd "/Volumes/Data/00-My Projects/ColdJot/coldjot"
git checkout refactor/mailops
npm test -w mailops                                    # 16 files / 98 tests passing
npx tsc --noEmit -p apps/mailops/tsconfig.json         # clean
npm run lint -w mailops                                # 0 errors, 244 warnings

git checkout -b refactor/mailops-phase-6-singleton     # branch off refactor/mailops tip
```
Then open [phase-6-kill-service-manager.md](./phase-6-kill-service-manager.md).

---

## Phase 6 progress — kill the ServiceManager singleton

**Goal:** replace the `ServiceManager.getInstance()` god-object with the plain composition root from Phase 1. See [phase-6-kill-service-manager.md](./phase-6-kill-service-manager.md). **Done — all 6 steps merged.**

**Sub-branch:** `refactor/mailops-phase-6-singleton` (merged `--no-ff` into `refactor/mailops`).

**Baseline (verified post-Phase-6 merge):** `npm test -w mailops` → 16 files / **98 tests passing**. `npx tsc --noEmit -p apps/mailops/tsconfig.json` → **clean**. `npm run lint -w mailops` → **0 errors, 242 warnings** (was 244 after Phase 5).

### Scope correction vs. the plan doc

The plan doc listed **3** `ServiceManager.getInstance()` callers (sequence controller, email processor, server.ts). The code had **~15**, including `JobManager` + `MonitoringService` (took SM in their constructors), `BaseProcessor.onFailed` (reached for SM on every failed job across all 5 processors), `routes/pubsub.ts` (`PubSubService.getInstance()` + `new InboxSyncServiceImpl()` at module level), `lib/bull-board` (signature took SM), the standalone `GmailClientService` + `ScheduleGenerator` singletons (carried `TODO(phase-6)`), and 3 more controllers (health, metrics) the doc didn't mention. The locked decisions still held; the step ordering absorbed the missed callers.

### Step tracker

| Step | What | Status | Commit |
|---|---|---|---|
| 6.1 | JobManager + MonitoringService take the queues map, not ServiceManager | ✅ done | `e26d17f` |
| 6.2 | BaseProcessor takes the DLQ map via constructor | ✅ done | `1770965` |
| 6.3 | Inject JobManager into processors; kill GmailClientService + ScheduleGenerator singletons | ✅ done | `720270a` |
| 6.4 | Controllers → factories; routes → `makeRouter(app)`; server.ts uses createApp(); delete ServiceManager | ✅ done | `c0718bb` |
| 6.5 | Update wiring test; remove dead SM mocks; clear stale TODO(phase-6) markers | ✅ done | `f62890c` |
| 6.6 | Kill utils/email re-export shim; resolve MessageDetails + MailboxWithAliases name collisions | ✅ done | `79e5101` |

### What 6.4 produced (the big merge)

**`composition-root.ts` now owns the full app graph:** infra singletons + queues + DLQs + JobManager + processors + MonitoringService + repos + domain services + controllers. `buildQueues()` moved verbatim from ServiceManager. `initializeApp(app)` boots memory monitor + PubSub + watch cleanup (the body of the old `ServiceManager.initialize()`); `shutdownApp(app)` is the old `ServiceManager.shutdown()` (same order: PubSub → monitor → processors → queues → DLQs → Redis → watch cleanup). The `App` interface gained `queues`, `dlQueues`, `processors`, `monitoring`, `redisClient`, and all 5 controllers; dropped `serviceManager`.

**Controllers → factory functions:** `createSequenceController`, `createHealthController`, `createMetricsController`, `createMailboxController`, `createListController` — each takes its deps (jobManager / monitoring / repos / rateLimit / redis / queues) instead of constructing module-level singletons.

**Routes → factories:** `makeSequenceRouter(controller)`, `makeHealthRouter`, `makeMetricsRouter`, `makeMailboxRouter`, `makeListsRouter`, `makePubsubRouter(inboxSync)`, `makeRouter(app)`. The pubsub route's eager `pubsubService.initialize()` is gone (it was a duplicate of what `initializeApp()` already does).

**`lib/bull-board`:** `mountBullBoard(queues: Queue[])` — takes the queues list directly (was `ServiceManager`).

**`server.ts`:** `createApp()` → `initializeApp()` → `makeRouter(app)`. SIGTERM/SIGINT → `shutdownApp(app)`.

**Deleted:** `services/service-manager.ts` (297 lines) + `createServiceManager` factory.

### Key decisions made during Phase 6 (read before resuming)

1. **`JobManager(queues)` + `MonitoringService(queues, sequenceStatsRepo?)`** hold the queues map directly (both only used SM for `getQueue()`). This reorders a latent bug: SM's constructor built the JobManager before `initializeQueues()` populated the queues; it worked only because `initialize()` ran before any job add. The new SM (during 6.1–6.3) constructs JobManager inside `initializeQueues()`; the final composition root builds queues first, then JobManager.
2. **`BaseProcessor.onFailed` takes the DLQ map via constructor** (4th param, default `new Map()`). Inherited by all 5 processors. Empty map in tests → no DLQ copy (the DLQ path was never asserted on).
3. **`EmailProcessor` had a dead `jobManager` field** (declared, never read) — deleted in 6.3. The other 3 processors (Schedule/Sequence/Contact) actually use `jobManager.addEmailJob(...)` → now a required constructor param.
4. **`GmailClientService` + `ScheduleGenerator` converted from `getInstance()` singletons to plain exported instances** (private constructor + getInstance → public constructor + `export const x = new X()`). The classes are stateless aside from config; the singleton *pattern* (process-wide one instance via getInstance) is what's killed, not the existence of a shared instance. The 4 locked infra singletons (Redis/MemoryMonitor/RateLimit/PubSub) + FileLogger keep `getInstance()` — genuine process-wide resources, owned inside `createApp()`.
5. **`MonitoringService.sequenceStatsRepo`** moved off the module-level singleton into a constructor param with Prisma default (the last module-level repo singleton in a service).
6. **`launchSequence` + `runSchedule` stay placeholders** ("not wired") — wiring them to real impls is Phase 7 scope. They don't block the ServiceManager kill (no production caller routes through `app.launchSequence` yet).
7. **The `utils/email.ts` re-export shim** was still load-bearing in Phase 5 — `adapters/gmail-inbox-source.ts` imported `isReplyMessage` via `@/utils/email` (the STATUS doc's "thread-watch is the only consumer" claim was wrong). Fixed the import to `@/services/inbox-sync/classify` then deleted the shim.
8. **Two name collisions resolved:** `MessageDetails` was defined in both `@coldjot/types` (pubsub.ts — the rich inbox-sync shape) and `adapters/mail-transport.ts` (the minimal sent-message-details shape) — renamed the local one to `SentMessageDetails`. `MailboxWithAliases` was in both `@coldjot/types` (the all-optional web DTO) and `repositories/mailbox.repo.ts` (the concrete-column DAO) — renamed the local one to `MailboxWithAliasesRecord`.

### Lint stance (Phase 6 residuals)

The `no-restricted-imports` rule did NOT flip to `error`. The 6 `@coldjot/database` residuals from Phase 4 are unchanged — `sequenceHealth` (monitor-only), the `$transaction` tx clients (`lib/stats`, `services/domain/tracking.service.ts`), and the `resetSequence` paths. None were Phase 6 scope. The rule flips after Phase 7 collapses the tx-client paths and folds `sequenceHealth` into a repo.

### Resume guide — Phase 6 is DONE; Phase 7 is next

**Where we are:** Phases 0–6 all merged into `refactor/mailops`. **Phase 7 (real test suite) is next** — it replaces the Phase 0 characterization tests with a permanent suite organized by layer, and is where `launchSequence` / `runSchedule` finally get wired to real impls.

```bash
cd "/Volumes/Data/00-My Projects/ColdJot/coldjot"
git checkout refactor/mailops
npm test -w mailops                                    # 16 files / 98 tests passing
npx tsc --noEmit -p apps/mailops/tsconfig.json         # clean
npm run lint -w mailops                                # 0 errors, 242 warnings

git checkout -b refactor/mailops-phase-7-tests         # branch off refactor/mailops tip
```
Then open [phase-7-test-suite.md](./phase-7-test-suite.md).

---

## Resume guide

> **Phases 0–6 are done.** Phase 7 (real test suite) is the next active phase — see [phase-7-test-suite.md](./phase-7-test-suite.md). The "Recommended order for the remaining groups" table below is preserved as Phase-0 reference only.

### Get back to a green state

The current working branch is `refactor/mailops` (Phases 0–6 merged). All phase sub-branches are merged; you do not need to checkout an old one.

```bash
cd "/Volumes/Data/00-My Projects/ColdJot/coldjot"
git checkout refactor/mailops

# Sanity check — all green:
npm test -w mailops                                   # 16 files / 98 tests pass
npx tsc --noEmit -p apps/mailops/tsconfig.json        # clean
npm run lint -w mailops                               # 0 errors, 242 warnings
```

### Recommended order for the remaining groups

Quickest wins first:

| Order | Group | Why this order | Effort |
|---|---|---|---|
| 1 | **L** placeholders | pure functions, no fakes needed | 15 min |
| 2 | **M** email-subject | pure functions, no fakes needed | 20 min |
| 3 | **K** schedule-generator | pure functions + fake timers for DST | 30 min |
| 4 | **N** rate-limiter | needs ioredis fake OR test class directly | 30 min |
| 5 | **D** schedule-processor | needs fake JobManager; reuses prisma fake | 40 min |
| 6 | **H** list-sync processor | reuses prisma fake | 20 min |
| 7 | **I** contact-processor | reuses prisma fake | 15 min |
| 8 | **J** gmail-client | mock googleapis; test token refresh | 30 min |
| 9 | **O** watch-cleanup | reuses prisma fake | 20 min |
| 10 | **E** sequence-controller | needs supertest | 45 min |
| 11 | **F** mailbox-routes | needs supertest | 30 min |
| 12 | **G** tracking-routes | needs supertest; pixel Buffer + UA filtering | 40 min |

### The per-group test recipe

Every test file follows the same shape:

```ts
// src/__tests__/characterization/<name>.test.ts
import { setupTestContext } from "@/__tests__/helpers/test-context";
const ctx = setupTestContext();

import { /* code under test */ } from "@/path/to/module";

beforeEach(() => {
  ctx.reset();
  // ctx.fake.seed("model", { ... }, ["uniqueField"]);
  // ctx.gmailResponses.send = { ... };        // for gmail paths
});

describe("[Group X] <feature>", () => {
  it("case 1: <behavior>", async () => {
    // seed state
    // call the code under test
    // assert on ctx.fake.calls (recorded prisma ops)
    // assert on ctx.fake.stores.<model>.rows.values() (rows written)
    // assert on ctx.stats (the updateSequenceStats spy)
    // assert on ctx.fakeGmail.calls (transport ops)
  });
});
```

**Key assertions:**
- `wasCalledWith(ctx, "modelName", "op", { partialArgs })` — recorded prisma call matches a partial shape.
- `ctx.fake.stores.emailEvent.rows.values()` — read back rows written.
- `ctx.stats` — the `updateSequenceStats` vi.fn spy; `.toHaveBeenCalledWith(...)`.
- `ctx.fakeGmail.calls` — recorded Gmail transport ops.

**Mocking global `fetch`** (REST paths like PubSub):
```ts
const fakeFetch = vi.fn(async (input) => { /* route by URL */ });
vi.stubGlobal("fetch", fakeFetch);
beforeEach(() => { vi.stubGlobal("fetch", fakeFetch); fakeFetch.mockClear(); });
```

**Unique fields:** `findUnique({ where: { field } })` only resolves if `field` is registered. The fake auto-registers `id`/`hash`/`email`; other fields must be declared: `ctx.fake.seed("model", row, ["fieldName"])`.

### After each group

```bash
npm test -w mailops                                   # all tests pass
npx tsc --noEmit -p apps/mailops/tsconfig.json        # clean
git add -A && git commit -m "test(mailops): phase 0 — Group X <name> characterization (N cases)"
```

Update the [Group tracker](#group-tracker) above — flip the row to ✅, bump the totals.

### When all 15 groups are done

```bash
git checkout refactor/mailops
git merge --no-ff refactor/mailops-phase-0-tests -m "merge: phase 0 — characterization tests complete (all 15 groups)"
# Flip Phase 0 row to ✅ DONE in the At-a-glance table.
git checkout -b refactor/mailops-phase-1-seams
```

### Solved pitfalls (don't re-hit these)

1. **`vi.mock` + TDZ:** `test-context.ts` uses `vi.hoisted` for the holder because `vi.mock` factories are hoisted above imports. Don't import the fakes at the top of `test-context.ts` and reference them in the factory — use the holder pattern that's already there.
2. **Proxy-as-handler bug:** the fake prisma's model proxies must use a *plain handler object* (`makeModelHandler(model)`), not a Proxy as the handler arg. Already fixed.
3. **`vi.unstubAllGlobals()` in afterEach:** don't call it — it restores the real `fetch`, breaking subsequent tests. Re-stub in `beforeEach` instead.
4. **Unique fields:** `findUnique({ where: { threadId } })` only resolves if `threadId` was registered via `seed(model, row, ["threadId"])`. Auto-registered: `id`, `hash` (emailTracking), `email` (mailbox/emailWatch).
5. **`getClient` mutation leak:** when a test swaps `gmailClientService.getClient` to throw (401 cases), save + restore it in a `try/finally`.
6. **Unique-field cheatsheet:** `processedMessage`→`messageId`, `emailThread`→`threadId`, `sequenceStats`→`sequenceId`.

### What each remaining group needs

- **L (placeholders):** `lib/placeholders/index.ts` — `replacePlaceholders` + `validatePlaceholders`. Pure. No fakes.
- **M (email-subject):** `lib/email-subject.ts` — `determineEmailSubject`. Pure except it may call gmail for thread subject; mock `@/lib/google` (already mocked).
- **K (schedule-generator):** `lib/schedule/index.ts` — `ScheduleGenerator.calculateNextRun`. Use `vi.useFakeTimers()` with fixed dates for DST.
- **N (rate-limiter):** `lib/rate-limiter.ts` — `RateLimiter` (Redis-backed token bucket). Mock ioredis OR test the class with a fake Redis.
- **D (schedule-processor):** `services/jobs/schedule/processor.ts` — `ScheduleProcessor`. Needs a fake `JobManager` (record `addEmailJob` calls). Polls `SequenceContact.nextScheduledAt`.
- **H (list-sync):** `services/jobs/list/processor.ts` — `ListSyncProcessor`. Reuses prisma fake.
- **I (contact-processor):** `services/jobs/contact/processor.ts` — `ContactProcessor`. Reuses prisma fake.
- **J (gmail-client):** `lib/google/gmail/gmail.ts` — `GmailClientService` + `refreshTokenIfNeeded`. Mock `googleapis`.
- **O (watch-cleanup):** `services/watch/cleanup.ts` — `WatchCleanupService`. Reuses prisma fake.
- **E (sequence-controller):** `routes/sequence/controller.ts`. Install `supertest` + `@types/supertest` as devDeps. Mount just the sequence router on a minimal Express app.
- **F (mailbox-routes):** `routes/mailbox.ts`. Same supertest approach. Mock `WatchService`.
- **G (tracking-routes):** `routes/tracking/controller.ts`. supertest. The transparent-pixel Buffer, `X-Robots-Tag` header, Gmail-compose-view referer filtering, Googlebot UA filtering, safe-redirect check.

---

## Per-phase completion checklist

Every phase's "Definition of done" boils down to:

- [ ] `tsc --noEmit` clean across the monorepo.
- [ ] `npm run lint` clean (zero errors, zero warnings).
- [ ] **All** Phase 0 characterization tests pass unchanged.
- [ ] `server.ts` boots; HTTP contract to the web app unchanged.
- [ ] Commit(s) pushed on the phase's sub-branch; sub-branch merged into `refactor/mailops`.
- [ ] At-a-glance table + Phase 0 Group tracker updated.

## Final coverage requirement

At the end of Phase 7, every mailops feature has test coverage. Phase 0 characterizes current behavior (so the refactor provably changes nothing); Phase 7 replaces those with a permanent suite organized by layer. See [Phase 0 § Coverage matrix](./phase-0-characterization-tests.md#coverage-matrix) and [Phase 7 § Feature → test mapping](./phase-7-test-suite.md#feature--test-mapping).

## What does NOT change (true for every phase)

- The HTTP API contract — every endpoint, header, status code, response body.
- BullMQ queue topology, job names, retry/DLQ policy (plan 10's work).
- The Prisma schema — no migrations.
- The Gmail PubSub push contract (`/pubsub` JWT verification, response semantics).
- The tracking pixel / click-redirect contract.
- The web ↔ mailops auth boundary (`requireServiceToken`).

## Relationship to other plans

- **`plans/mailops-consolidation/`** — deliberately postponed. This refactor *enables* future consolidation but does not perform it.
- **`plans/refactor-plan/10` (BullMQ resilience)** — already done; untouched here.
- **`plans/refactor-plan/03` (service auth + CORS)** — already done; `requireServiceToken` middleware untouched.
- **`plans/testing/01-testing-baseline.md`** — picks Vitest; Phase 0 + Phase 7 reuse that choice.
