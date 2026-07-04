# Phase 0 Progress — Characterization Tests

> Live tracker for `refactor/mailops-phase-0-tests`. Updated as each test group lands.
>
> **Goal:** 15 test files (Groups A–O), ~75–90 cases, pinning every mailops feature before any production code moves. See [phase-0-characterization-tests.md](./phase-0-characterization-tests.md#coverage-matrix) for the full matrix.
>
> **Run:** `npm test -w mailops` · **Branch:** `refactor/mailops-phase-0-tests`

## At-a-glance

| Group | Feature | Test file | Cases | Status |
|---|---|---|---|---|
| **A** | Email send (Gmail API) | `email-service.test.ts` | 6 | ✅ done |
| **B** | Tracking (open/click/event + rate math) | `tracking-service.test.ts` | 9 | ✅ done |
| **C** | PubSub inbox sync | `pubsub-handler.test.ts` | 8 | ✅ done |
| D | Schedule tick | `schedule-processor.test.ts` | ~5 | ⬜ not started |
| E | Sequence lifecycle | `sequence-controller.test.ts` | ~8 | ⬜ not started |
| F | Mailbox watch | `mailbox-routes.test.ts` | ~4 | ⬜ not started |
| G | Tracking pixel + click HTTP | `tracking-routes.test.ts` | ~7 | ⬜ not started |
| H | List sync | `list-sync.test.ts` | ~3 | ⬜ not started |
| I | Contact sync | `contact-processor.test.ts` | ~2 | ⬜ not started |
| J | Gmail OAuth client + token refresh | `gmail-client.test.ts` | ~4 | ⬜ not started |
| K | Schedule generator (DST/business hours) | `schedule-generator.test.ts` | ~5 | ⬜ not started |
| L | Placeholders | `placeholders.test.ts` | ~4 | ⬜ not started |
| M | Email subject resolution | `email-subject.test.ts` | ~5 | ⬜ not started |
| N | Rate limiter | `rate-limiter.test.ts` | ~4 | ⬜ not started |
| O | Watch cleanup | `watch-cleanup.test.ts` | ~3 | ⬜ not started |

**Totals:** 3/15 files · **23/~85 cases** · 23 passing · 0 failing · tsc clean · lint clean (warnings only)

## What's pinned so far

### Group A — EmailService.sendEmail (6 cases) ✅
- Tracked happy-path send: EmailTracking(SENT) + EmailEvent(SENT) + stats + send→get→get→insert→delete sequence
- disableSending shortcut: fake IDs, no Gmail calls, tracking still written
- 401 → throws TOKEN_EXPIRED
- SMTP 535/AUTH XOAUTH2 → throws TOKEN_EXPIRED
- ~1s delay between send and get-details (fake timers)
- Empty html throws "Content and tracking information are required" *(TODO(behavior) for Phase 4b)*

### Group B — Tracking (9 cases) ✅
- `TrackingService.handleEmailOpen` first open: openCount++, OPENED event isFirstOpen=true, stats isUniqueOpen:true
- `handleEmailOpen` repeat open: STILL creates OPENED event *(current behavior; Phase 4a may change)*
- `handleLinkClick`: LinkClick + TrackedLink.clickCount++ + CLICKED event + stats, returns URL
- `recordEmailOpen` standalone: mirrors class but sets status to lowercase "opened" *(divergence pinned)*
- `createEmailTracking` happy: pending status, 48-char hash, jobId
- `createEmailTracking` missing-field throw
- `trackEmailEvent` rate math: all 5 event types (SENT/OPENED/CLICKED/REPLIED/BOUNCED) with exact expected values
- `trackEmailEvent` no-stats-row → creates initial stats
- `updateTrackingStats` parity: documents that calculateRates path DISAGREES with inline math *(denominator sentEmails+1 vs sentEmails)*

### Group C — PubSubHandler.handleNotification (8 cases) ✅
- Reply → REPLIED event + contact update + stats
- Bounce → BOUNCED event + contact update + stats
- Original message (own mailbox) → no event
- Already-processed message → skipped
- Large history gap → HISTORY_GAP record, watch historyId updated, no message processing
- Missing EmailWatch → returns early
- Watch exists but no Mailbox → returns early
- Token refresh returns null → returns early

## Harness built (reusable for remaining groups + later phases)

- `vitest.config.ts` — node env, globals, `@/` alias, coverage config
- `src/__tests__/setup.ts` — dummy env vars (so `config/env.ts` zod validation passes at import)
- `src/__tests__/helpers/fake-prisma.ts` — in-memory Prisma stub (create/update/updateMany/findUnique/findFirst/findMany/count/upsert/delete/deleteMany/$transaction + nested relation writes + unique-field registration)
- `src/__tests__/helpers/fake-gmail.ts` — canned gmail_v1.Gmail (send/get/insert/delete/threads.get) + makeFakeFetch
- `src/__tests__/helpers/test-context.ts` — vi.mock wiring for @coldjot/database, @/lib/google, @/lib/google/gmail/helper, @/lib/stats via vi.hoisted

## Notes for remaining groups

- **D (schedule-processor):** needs a fake JobManager (records addEmailJob calls). The processor polls `SequenceContact.nextScheduledAt`.
- **E (sequence-controller):** use supertest against an Express app with just the sequence router + faked services. Default-business-hours creation is a key case.
- **G (tracking-routes):** supertest. The pixel Buffer + header assertions + Gmail-compose-view/Googlebot UA filtering.
- **K (schedule-generator):** pure-function tests with `vi.useFakeTimers()` for DST boundaries.
- **L, M:** pure-function tests, no fakes needed.
- **N (rate-limiter):** needs an ioredis fake OR test the RateLimiter class directly with a mocked Redis client.

## Definition of done for Phase 0

- [ ] All 15 groups have passing test files
- [ ] Every row in the [Must-not-change inventory](./phase-0-characterization-tests.md#must-not-change-inventory) is pinned
- [ ] `npm test -w mailops` green; tsc clean; lint clean
- [ ] Sub-branch merged into `refactor/mailops`
