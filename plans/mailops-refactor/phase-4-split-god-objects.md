# Phase 4 — Split the Three God-Objects

> **Goal:** break the three largest files into layered, single-responsibility pieces. Each becomes a small domain service orchestrating narrow collaborators.
>
> **Branch:** `refactor/mailops-phase4` (off Phase 3 branch)
> **Estimated effort:** 5–7 days total (4a: 1–2 days, 4b: 1–2 days, 4c: 3 days)
> **Behavior change:** intended to be zero. Where current code has *duplicate* paths that already disagree (tracking), the canonical path is picked and the duplicate deleted — Phase 0 characterization tests document which one wins.

This is the heart of the refactor. Do the three splits **in order**: 4a (tracking, smallest, clearest duplication), 4b (email, medium, has the dead SMTP branch), 4c (pubsub, biggest, most embedded rules).

---

## 4a — `lib/tracking/index.ts` (804 lines) → one service + isolated pure helpers

### Today's mess (concrete reference)

`lib/tracking/index.ts` exports **two parallel surfaces** doing the same work:

**Standalone functions:**
- `createEmailTracking` (line 17) — creates a `pending` EmailTracking row + returns a domain `EmailTracking` object.
- `recordEmailOpen` (line 91) — first-open + repeat-open handling, creates `OPENED` event, calls `updateSequenceStats`.
- `recordLinkClick` (line 152) — click record + increment; **the stats call is commented out** (lines 193–198).
- `addTrackingToEmail` (line 228) — wraps links + injects pixel.
- `getEmailEvents` / `getSequenceEvents` (lines 350, 357) — read queries.
- `trackEmailEvent` (line 386) — generic event recorder with **inline rate math** (lines 449–500) that **disagrees** with `updateTrackingStats`.
- `updateTrackingStats` (line 533) — uses `calculateRates` helper (line 516).

**`TrackingService` class (line 607):**
- `handleEmailOpen` (line 608) — same purpose as `recordEmailOpen`, slightly different shape (uses `include: events` instead of a separate `findFirst`).
- `handleLinkClick` (line 670) — same purpose as `recordLinkClick`, *does* update stats (the standalone one doesn't).
- `trackEmailEvent` (line 754) — same purpose as the standalone, different shape again.

**Plus:** commented-out block (193–198), leftover `console.log` (303–305, 411, 502, 510), and a stray `console.error` everywhere.

### Who calls what (from Phase 0 grep — verify still current)

| Export | Caller |
|---|---|
| `trackingService.handleEmailOpen` | `routes/tracking/controller.ts:76` |
| `trackingService.handleLinkClick` | `routes/tracking/controller.ts:101` |
| `trackingService.trackEmailEvent` | `routes/tracking/controller.ts:141` |
| `createEmailTracking` | `services/jobs/email/processor.ts:184` |
| `addTrackingToEmail` | `lib/email/index.ts:95, 212` |
| `recordEmailOpen` / `recordLinkClick` / standalone `trackEmailEvent` / `updateTrackingStats` | **no current callers** — dead |

So the *live* surface is: `TrackingService` class (3 methods) + `createEmailTracking` + `addTrackingToEmail`. The standalone `recordEmailOpen` / `recordLinkClick` / `trackEmailEvent` / `updateTrackingStats` are **dead code** already.

### Target structure

```
services/domain/
└── tracking.service.ts           TrackingServiceImpl implements TrackingService (~120 lines)
lib/tracking/
├── pixel.ts                      generateTrackingPixel (pure)
├── link-wrap.ts                  wrapLinksWithTracking + addTrackingToEmail (pure except createTrackedLink)
├── stats.ts                      calculateRates (pure) — single source of truth
└── index.ts                      barrel re-export of the pure helpers + the repo stopgap
```

### Steps

**4a.1 — Isolate the pure helpers (move-only).**
- Move `generateTrackingPixel` (line 278) verbatim → `lib/tracking/pixel.ts`.
- Move `wrapLinksWithTracking` (line 297) + `addTrackingToEmail` (line 228) → `lib/tracking/link-wrap.ts`. Keep `createTrackedLink` as a dependency *injected* (it's a DB write) — change signature to `addTrackingToEmail(content, tracking, createLink: (trackingId, url) => Promise<string>)`. The composition root binds it: `(id, url) => trackedLinkRepo.create(id, url)`.
- Move `calculateRates` (line 516) → `lib/tracking/stats.ts`. This becomes the **single** rate-math source.
- `lib/tracking/index.ts` becomes a barrel that re-exports them so existing imports (`@/lib/tracking`) keep working during the migration.

**Verify:** characterization tests pass. The `console.log` calls at lines 303–305 die in this commit — delete them as you move.

**4a.2 — Pick the canonical open/click path.**
The class API (`TrackingService.handleEmailOpen/handleLinkClick`) is the live one (route controller uses it). The standalone equivalents are dead. Decision: **class wins.**

Move `TrackingServiceImpl` to `services/domain/tracking.service.ts`. Constructor takes the repositories (already injected in Phase 3):
```ts
export class TrackingServiceImpl implements TrackingService {
  constructor(
    private readonly emailTracking: EmailTrackingRepository,
    private readonly emailEvent: EmailEventRepository,
    private readonly trackedLink: TrackedLinkRepository,
    private readonly linkClick: LinkClickRepository,
    private readonly stats: SequenceStatsRepository,
  ) {}
  // handleEmailOpen / handleLinkClick / trackEmailEvent — bodies unchanged
}
```

**4a.3 — Reconcile the stats path.**
Two stats strategies exist:
- `trackEmailEvent` (standalone, line 386): inline math at lines 449–500.
- `updateTrackingStats` (line 533): uses `calculateRates`.

Both are dead per the caller grep, so this is **delete, not reconcile**. Delete both. Where the live `TrackingServiceImpl` calls `updateSequenceStats` (the `lib/stats/index.ts` function), leave that call alone — it's the *third* stats path and it's the one actually in use. Document this in a `// NOTE:` comment: stats flow is `TrackingServiceImpl → lib/stats.updateSequenceStats`. If `lib/stats` duplicates the rate math, that's a Phase 7 cleanup, not Phase 4.

**Verify:** Phase 0 characterization test 0b-case-6 (the rate-math canary) — if it tested the dead `trackEmailEvent` math, delete that test case (it pinned dead code). Update the test file's commit message to say so.

**4a.4 — Delete the standalone dead exports.**
Remove `recordEmailOpen`, `recordLinkClick`, `trackEmailEvent`, `updateTrackingStats`, `getEmailEvents`, `getSequenceEvents` from `lib/tracking/index.ts`. Grep confirms zero callers.

**Verify:** `tsc` clean (no missing imports). Characterization tests pass.

**4a.5 — Migrate `createEmailTracking` caller.**
`services/jobs/email/processor.ts:184` calls `createEmailTracking(metadata)`. Two options:
- (a) Move `createEmailTracking` into `TrackingServiceImpl` as `createTracking(metadata)` and have the EmailProcessor call `tracking.createTracking(...)`.
- (b) Leave it as a free function in `lib/tracking/index.ts` taking the repo as a parameter.

**Pick (a)** — it's a tracking concern, belongs on the service. EmailProcessor already has access to the TrackingService via the composition root (Phase 6 makes this proper injection; for Phase 4a it can read from the same module-level singleton stopgap used in Phase 3).

**Verify:** characterization test 0b-case-5 (`createEmailTracking` happy + missing-field) passes against the new `TrackingServiceImpl.createTracking`.

### Definition of done (4a)
- [ ] `lib/tracking/index.ts` is a barrel ≤ 30 lines.
- [ ] `services/domain/tracking.service.ts` ≤ 150 lines.
- [ ] `lib/tracking/pixel.ts`, `link-wrap.ts`, `stats.ts` are pure (no `prisma`, no `logger` side-effects except where unavoidable).
- [ ] No `console.log` / `console.error` anywhere in tracking code.
- [ ] Standalone dead exports deleted.
- [ ] Characterization tests for open / click / createTracking pass.
- [ ] The rate-math canary test is either still passing or explicitly deleted (with reason in commit message).

---

## 4b — `lib/email/index.ts` (427 lines) → orchestration + transport + message builder

### Today's mess (concrete reference)

`EmailService.sendEmail` (line 46) is one ~200-line method that does:
1. Branch on `useApi = true` (line 48) — the SMTP branch (line 210) is **dead** because `useApi` is hardcoded.
2. `disableSending` shortcut (line 52) — returns fake IDs, still writes tracking + event.
3. Get Gmail client via `gmailClientService.getClient` (line 80).
4. Build sender info + thread headers (lines 86–92).
5. Build tracked content via `addTrackingToEmail` (line 95).
6. Build RFC822 message via `createEmailMessage` (line 101).
7. `gmail.users.messages.send` (line 111).
8. Wait 1s, fetch sent details (line 120–126).
9. Build untracked copy via `createUntrackedMessage` (line 137).
10. `gmail.users.messages.insert` + `delete` the tracked original (lines 150–170).
11. Update tracking + create event + update stats (lines 180–193).

**Plus:** stray `null;` statement (line 134), unused `createEmailTrackingRecord` private method (line 294), `handleSendEmailError` is just a logger (line 371), `getSentMessageDetails` (line 400).

### SMTP decision (the one place I want your call)

The SMTP branch (`sendGmailSMTP` at line 216) is unreachable today (`useApi = true` always). Two options:

- **(a) Resurrect as real fallback** — wire it back behind `MailTransport`, remove the `useApi` toggle, make Gmail transport throw on auth failure → fall back to SMTP. **Risk:** the SMTP path's tracking integration is sketchy (it returns without writing `EmailTracking`/`EmailEvent`).
- **(b) Delete honestly** — remove the SMTP branch + `lib/google/smtp/*` (3 files, ~530 lines) + the `sendGmailSMTP` export. **Recommend this.** Dead code pretending to be live is worse than no fallback; if you need SMTP later, it's a clean re-implementation against `MailTransport`.

**Default in this plan: (b).** If you want (a), say so before this phase starts — it adds ~1 day.

### Target structure

```
adapters/
├── mail-transport.ts             interface (from Phase 1)
└── gmail-transport.ts            GmailTransport implements MailTransport
services/domain/
└── send-email.service.ts         SendEmailServiceImpl implements SendEmailService (~100 lines)
lib/email/
├── helper.ts                     createEmailMessage / createUntrackedMessage / generateSenderInfo (already pure — leave)
└── index.ts                      barrel only (re-exports GmailTransport for backwards compat during migration)
```

### Steps

**4b.1 — Extract `GmailTransport` (move-only).**
Create `adapters/gmail-transport.ts`:
```ts
import type { gmail_v1 } from "googleapis";
import type { MailTransport, MessageDetails } from "./mail-transport";
import { gmailClientService } from "@/lib/google";
import { EmailLabelEnum } from "@coldjot/types";

export class GmailTransport implements MailTransport {
  async getClient(userId: string, mailboxId: string): Promise<gmail_v1.Gmail> {
    return gmailClientService.getClient(userId, mailboxId);
  }
  async send({ userId, raw, threadId }) {
    const gmail = /* get client — see note below */;
    const { data } = await gmail.users.messages.send({ userId, requestBody: { raw, threadId } });
    return { id: data.id!, threadId: data.threadId };
  }
  async insert({ userId, raw, threadId, labelIds }) { /* … */ }
  async delete(id: string) { /* … */ }
  async getSentDetails(id: string): Promise<MessageDetails> { /* body of current getSentMessageDetails */ }
}
```

> **Note on `getClient`:** `EmailService.sendEmail` calls `getClient` once with `(userId, mailbox.id)` and reuses the client for send/get/insert/delete. To preserve that, either (a) have the transport's `send`/`insert`/etc. each fetch a fresh client (slight perf cost — one extra OAuth check per send), or (b) introduce a `MailTransportSession` concept the orchestrator opens once. **Pick (a)** for simplicity; the GmailClientService caches tokens internally so the cost is one cache lookup.

Move `getSentMessageDetails` (line 400 of `lib/email/index.ts`) verbatim into `GmailTransport.getSentDetails`.

**Verify:** no caller change yet. Composition root wires `new GmailTransport()` behind `MailTransport`.

**4b.2 — Extract `SendEmailServiceImpl` (orchestration).**
Create `services/domain/send-email.service.ts`. Body of `send(options)`:
```ts
async send(options: SendEmailOptions): Promise<EmailResult> {
  if (options.disableSending) return this.sendDisabled(options);
  const gmail = await this.transport.getClient(options.userId, options.mailbox!.id!);
  const senderInfo = await generateSenderInfo(options.mailbox);
  const { threadHeaders, originalSubject } = await getEmailThreadInfo(gmail, options.threadId);

  const trackedContent = await addTrackingToEmail(options.html, options.tracking, (id, url) => this.trackedLink.create(id, url));
  const encodedMessage = createEmailMessage({ /* … unchanged … */ });

  const { id, threadId } = await this.transport.send({ userId: "me", raw: encodedMessage, threadId: options.threadId });
  await delay(1000); // preserve current behavior — Gmail propagation wait
  const details = await this.transport.getSentDetails(id);
  if (details.messageId) threadHeaders.messageId = details.messageId;

  let untrackedId: string | undefined;
  if (options.html) {
    const encodedUntracked = await createUntrackedMessage({ /* … unchanged … */ });
    untrackedId = (await this.transport.insert({ userId: "me", raw: encodedUntracked, threadId: details.threadId, labelIds: [EmailLabelEnum.SENT] })).id;
    try { await this.transport.delete(id); } catch (err) { logger.error({ err }, "Error deleting original tracked message"); }
  }

  await this.emailTracking.markSent(options.tracking.id, { messageId: id, threadId, untrackedMessageId: untrackedId }, options.subject, options.sequenceId, options.contactId);
  await this.stats.apply(options.sequenceId, EmailEventEnum.SENT, options.contactId);

  return { success: true, messageId: id, threadId: threadId! };
}
```

Notice what's gone: the `useApi` toggle, the SMTP branch, the stray `null;`, the `handleSendEmailError` method (replaced with try/catch + logger inline), the unused `createEmailTrackingRecord`.

**Auth-failure handling:** preserve the `TOKEN_EXPIRED` throw — wrap the transport calls in try/catch and re-throw as `new Error("TOKEN_EXPIRED")` on 401/535, exactly as the current code does (line 233–238).

**Verify:** characterization tests 0a-1 (tracked send), 0a-2 (disableSending), 0a-3 (auth failure) all pass.

**4b.3 — Migrate the EmailProcessor caller.**
`services/jobs/email/processor.ts:228` calls `emailService.sendEmail(emailOptions)`. Swap to `this.sendEmail.send(emailOptions)` (constructor-injected). The Phase 3 stopgap pattern applies if EmailProcessor isn't yet fully injected.

**4b.4 — Delete the old `EmailService` class + the SMTP path.**
- Delete `lib/email/index.ts`'s `EmailService` class + `emailService` export. Replace the file with a barrel: `export { GmailTransport } from "@/adapters/gmail-transport";` (only if any consumer still imports from `@/lib/email`; otherwise delete the file entirely).
- Delete `lib/google/smtp/gmail.ts`, `lib/google/smtp/helper.ts`, `lib/google/smtp/nodemailer.ts`.
- Remove the `sendGmailSMTP` export from `lib/google/index.ts`.
- Remove `nodemailer` from `apps/mailops/package.json` devDeps/dependencies.

**Verify:** `tsc` clean. Grep confirms no remaining references to `EmailService`, `sendGmailSMTP`, `nodemailer`. Characterization tests pass.

### Definition of done (4b)
- [ ] `services/domain/send-email.service.ts` ≤ 100 lines.
- [ ] `adapters/gmail-transport.ts` exists, implements `MailTransport`.
- [ ] SMTP branch + `lib/google/smtp/*` deleted (assuming option b).
- [ ] `nodemailer` removed from package.json.
- [ ] No stray `null;`, no unused private methods.
- [ ] Characterization tests 0a-1/2/3 pass.

---

## 4c — `services/pubsub/handler.ts` (1,366 lines) → pipeline of small stages

### Today's mess (concrete reference)

`PubSubHandler` does, top-to-bottom:
1. `handleNotification` (line 63) — entry; decode + find watch + retry-wrapped process.
2. `getWatchRecord` (line 136) — find EmailWatch + Mailbox.
3. `createNotificationRecord` (line 185) — write EmailWatchHistory (PROCESSING).
4. `processNotificationWithRetry` (line 242) — `backOff` wrapper.
5. `markNotificationAsProcessed` (line 283) — set `processed: true`.
6. `processHistoryChanges` (line 314) — the heart: token refresh, history gap, fetch history, process records, update statuses, update watch historyId.
7. `handleLargeHistoryGap` (line 442) — too-old history → skip + log.
8. `getValidAccessToken` (line 506) — wraps `refreshTokenIfNeeded`.
9. `fetchGmailHistory` (line 520) — REST call to `GMAIL_API.HISTORY`.
10. `fetchMessageDetails` (line 550) — REST call to `GMAIL_API.MESSAGES`.
11. `processHistoryRecords` (line 680) — loop over records, classify, dispatch to `processBounce` / `processReply`.
12. `processBounce` (line 866) — write BOUNCED event + update contact + stats.
13. `processReply` (similar) — write REPLIED event + update contact + stats.

### Target structure — a pipeline

```
adapters/
└── gmail-inbox-source.ts         GmailInboxSource implements InboxSource
                                    (fetchHistory, fetchMessage, getValidAccessToken)
services/inbox-sync/
├── classify.ts                   pure predicates (reply / bounce / original / external)
├── states.ts                     SequenceContact status transitions per classification
└── apply-classification.ts       writes EmailEvent + updates SequenceContact + stats
services/domain/
└── inbox-sync.service.ts         InboxSyncServiceImpl — flat orchestrator (~150 lines)
```

### Steps

**4c.1 — Extract `GmailInboxSource` (move-only).**
Create `adapters/gmail-inbox-source.ts`. Move verbatim:
- `getValidAccessToken` (line 506) → `getValidAccessToken(mailbox)`.
- `fetchGmailHistory` (line 520) → `fetchHistory({ startHistoryId, accessToken })`.
- `fetchMessageDetails` (line 550) → `fetchMessage({ messageId, accessToken, mailbox })`.

These contain the only `fetch()` calls in the file. After this step, the handler no longer touches `fetch` or `refreshTokenIfNeeded` directly.

**Verify:** characterization tests 0c-1/2/3/4 still pass (they mock `fetch` globally; now they mock the `InboxSource` interface instead — update test wiring).

**4c.2 — Extract pure classification (move-only).**
Create `services/inbox-sync/classify.ts`. Relocate:
- The predicates already in `utils/email.ts` (`isBounceMessage`, `isReplyMessage`, `isExternalSender`, `shouldProcessMessage`, `hasMessageContent`) — leave them where they are and re-export, OR move them here. **Pick: move** — they're inbox-sync-specific. Update `utils/email.ts` to re-export from the new location for backwards compat.
- `determineNotificationType` (currently in `services/pubsub/helper.ts`) → move to `classify.ts`.
- `calculateHistoryGap` + `isLargeHistoryGap` → move to `classify.ts` (or to a `services/inbox-sync/history-gap.ts` if you prefer).

These are pure functions — no DB, no fetch. Easy to unit-test in isolation (add tests in Phase 7).

**4c.3 — Extract status transitions.**
Create `services/inbox-sync/states.ts`. This holds the "given a classification, what should happen to the SequenceContact?" decision. Today this logic is embedded inside `processBounce` (line 866) and `processReply`. Extract:
```ts
export function nextContactStatus(current: SequenceContactStatusEnum, classification: NotificationType): SequenceContactStatusEnum | null {
  // e.g. REPLY → opted_out/responded, BOUNCE → bounced, ORIGINAL → null (no change)
}
```
The exact mapping is whatever the current code does — pin it from the characterization tests.

**4c.4 — Extract `applyClassification`.**
Create `services/inbox-sync/apply-classification.ts`. One function:
```ts
export async function applyClassification(input: {
  change: HistoryChange;
  emailThread: EmailThread | null;
  repos: { emailEvent: EmailEventRepository; sequenceContact: SequenceContactRepository; stats: SequenceStatsRepository; };
}): Promise<void>
```
Body is the deduplicated guts of `processBounce` + `processReply`: idempotency check (existing-event lookup), EmailEvent write, SequenceContact update, stats update. Two classifications (REPLY, BOUNCE) flow through the same function instead of two near-duplicate methods.

**Verify:** characterization tests 0c-1 (reply) and 0c-2 (bounce) pass — the rows written must be identical.

**4c.5 — Write `InboxSyncServiceImpl` (the orchestrator).**
Create `services/domain/inbox-sync.service.ts`:
```ts
export class InboxSyncServiceImpl implements InboxSyncService {
  constructor(
    private readonly emailWatch: EmailWatchRepository,
    private readonly emailWatchHistory: EmailWatchHistoryRepository,
    private readonly processedMessage: ProcessedMessageRepository,
    private readonly emailThread: EmailThreadRepository,
    private readonly apply: typeof applyClassification,
    private readonly inboxSource: InboxSource,
    private readonly repos: {/* the ones applyClassification needs */},
  ) {}

  async handleNotification(message: PubSubMessage): Promise<void> {
    const notification = decodeNotification(message);
    const watch = await this.emailWatch.findWithMailbox(notification.emailAddress);
    if (!watch) return;
    await this.processWithRetry(watch, notification);
  }

  private async processWithRetry(watch, notification) {
    await backOff(() => this.processHistory(watch, notification.historyId), { /* unchanged */ });
  }

  private async processHistory(watch, historyId) {
    if (await this.processedMessage.isHistoryProcessed(watch.id, historyId)) return;
    const token = await this.inboxSource.getValidAccessToken(watch.mailbox);
    if (!token) return;
    const { gap } = calculateHistoryGap(watch.historyId, historyId);
    if (isLargeHistoryGap(gap)) return this.handleLargeGap(watch, historyId);

    const response = await this.inboxSource.fetchHistory({ startHistoryId, accessToken: token });
    if (!response) return this.handleLargeGap(watch, historyId);

    for (const record of response.history ?? []) {
      for (const message of messagesOf(record)) {
        if (await this.processedMessage.exists(message.id, message.threadId)) continue;
        if (message.labelIds.includes("DRAFT")) continue;
        const details = await this.inboxSource.fetchMessage({ messageId: message.id, accessToken: token, mailbox: watch.mailbox });
        if (!details || !hasMessageContent(details.headers)) continue;
        const type = determineNotificationType(details, userEmailsOf(watch), message.threadId);
        await this.processedMessage.mark(message.id, message.threadId, type);
        const thread = await this.emailThread.findByThreadId(message.threadId);
        await this.apply({ change: { ... }, emailThread: thread, repos: this.repos });
      }
    }
    await this.emailWatch.updateHistoryId(watch.id, response.historyId);
  }

  private async handleLargeGap(watch, historyId) { /* unchanged body */ }
}
```

The class reads top-to-bottom as a sequence of named steps. Each step is one screen of code.

**4c.6 — Replace `PubSubHandler` usage.**
`services/pubsub/client.ts` currently calls `pubSubHandler.handleNotification(message)`. Swap to `inboxSync.handleNotification(message)`. Delete `services/pubsub/handler.ts` (the whole 1,366-line file) and `services/pubsub/helper.ts` (its functions are relocated to `classify.ts` / `apply-classification.ts` / the new service).

**Verify:** characterization tests 0c-1/2/3/4 pass. Grep confirms `services/pubsub/handler.ts` is gone.

**4c.7 — Handle the dormant ThreadProcessor.**
`services/jobs/thread-watch/processor.ts` (846 lines) is commented out in `service-manager.ts:174-175`. It's the polling alternative to PubSub push.
- **Option (a):** move it under `services/inbox-sync/polling-source.ts` as a second `InboxSource` impl, marked `@deprecated`. Keep it compilable.
- **Option (b):** delete it. If you ever need polling, write a fresh `PollingInboxSource` against the clean interface — easier than resurrecting 846 lines of pre-refactor code.

**Recommend (b).** It's dead today and the new seam makes reimplementation cheap later. Phase 5 deletes it.

### Definition of done (4c)
- [ ] `services/domain/inbox-sync.service.ts` ≤ 150 lines.
- [ ] `services/inbox-sync/classify.ts`, `states.ts`, `apply-classification.ts` each ≤ 150 lines, pure (no DB writes except `apply-classification` which uses repos).
- [ ] `adapters/gmail-inbox-source.ts` exists, implements `InboxSource`.
- [ ] `services/pubsub/handler.ts` deleted. `services/pubsub/client.ts` calls `InboxSyncService`.
- [ ] No file in `services/` exceeds ~250 lines.
- [ ] Characterization tests 0c-1/2/3/4 pass.

---

## Phase 4 overall definition of done

- [ ] No file in `apps/mailops/src/{lib,services}` exceeds ~300 lines (god-objects ≤ ~150).
- [ ] Three god-objects gone; replaced by small services + pure helpers + adapters.
- [ ] All Phase 0 characterization tests pass.
- [ ] `tsc --noEmit` clean; ESLint clean.
- [ ] The composition root (`composition-root.ts`) wires the new services; `server.ts` still boots unchanged.
- [ ] SMTP path deleted (option b); nodemailer removed (or — if you chose option (a) — SMTP wired behind `MailTransport` with the toggle removed).

## What to commit

- 4a: 5 commits (one per step).
- 4b: 4 commits.
- 4c: 7 commits.

Each commit: characterization tests green, `tsc` green.

## Risks

| Risk | Mitigation |
|---|---|
| 4c is the riskiest split — most embedded business logic | It's done last (after 4a/4b built confidence) and has the most characterization coverage (4 cases). Each step is move-only until 4c.5 (which is the only synthesis step). |
| The `delay(1000)` after Gmail send feels like a bug | It's current behavior. Preserve it. Add a `// TODO:` comment to revisit in Phase 7. |
| Deleting SMTP loses a "fallback" someone might rely on | Confirm with you before 4b starts. Default is delete. |
| Classification predicates move breaks `utils/email.ts` importers | Re-export from `utils/email.ts` for backwards compat. Grep confirms only mailops-internal callers. |
