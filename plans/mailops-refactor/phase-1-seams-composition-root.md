# Phase 1 — Introduce the Seams (interfaces + composition root)

> **Goal:** put the layered skeleton in place **without moving any logic**. New files only; existing code keeps running unchanged. The composition root is created but not yet used by `server.ts`.
>
> **Branch:** `refactor/mailops-phase1` (off Phase 0 branch)
> **Estimated effort:** 2–3 days
> **Behavior change:** zero. No production import path is altered. `tsc` stays green; the new code is exercised only by a wiring test.

## Why this phase exists

The whole refactor hinges on dependencies being *passed in*, not *reached for*. Today every processor does `ServiceManager.getInstance()` and every lib does `import { prisma } from "@coldjot/database"`. We can't change those call sites one at a time without a target to change them *to*. This phase builds the targets — the interfaces — and a single place that wires concrete implementations to them.

Once this lands, Phase 2–4 each become a controlled migration: "swap one import for an injected interface". No more big-bang.

## The skeleton

```
apps/mailops/src/
├── adapters/
│   ├── mail-transport.ts          interface MailTransport
│   ├── inbox-source.ts            interface InboxSource
│   ├── pubsub-client.ts           interface PubSubClient
│   └── clock.ts                   interface Clock
├── repositories/
│   ├── email-tracking.repo.ts     interface EmailTrackingRepository
│   ├── email-event.repo.ts        interface EmailEventRepository
│   ├── sequence-contact.repo.ts   interface SequenceContactRepository
│   ├── sequence.repo.ts           interface SequenceRepository
│   ├── sequence-step.repo.ts      interface SequenceStepRepository
│   ├── sequence-stats.repo.ts     interface SequenceStatsRepository
│   ├── mailbox.repo.ts            interface MailboxRepository
│   ├── tracked-link.repo.ts       interface TrackedLinkRepository
│   ├── link-click.repo.ts         interface LinkClickRepository
│   ├── email-thread.repo.ts       interface EmailThreadRepository
│   ├── email-watch.repo.ts        interface EmailWatchRepository
│   ├── email-watch-history.repo.ts
│   ├── processed-message.repo.ts
│   ├── business-hours.repo.ts
│   ├── template.repo.ts
│   ├── contact.repo.ts
│   └── prisma/                    ← concrete impls (one file per repo, all delegating to prisma)
│       ├── prisma-email-tracking.repo.ts
│       ├── prisma-email-event.repo.ts
│       └── … (one per interface)
├── services/
│   └── domain/
│       ├── send-email.service.ts      interface SendEmailService
│       ├── tracking.service.ts        interface TrackingService
│       ├── inbox-sync.service.ts      interface InboxSyncService
│       ├── launch-sequence.service.ts interface LaunchSequenceService
│       └── run-schedule.service.ts    interface RunScheduleService
├── controllers/                       ← empty placeholder; Phase 2 fills it
└── composition-root.ts                ← the ONE wiring file
```

## Interface design rules

These are the rules every interface in this phase follows. Read them once; they apply to all of Step 1.1–1.4.

1. **Interface = the surface area callers actually need**, not the full Prisma model API. If `EmailProcessor` only calls `prisma.emailTracking.findFirst({where, select})` and `prisma.emailTracking.create({data})`, the interface has exactly those two methods.
2. **Methods are named by intent, not by SQL verb.** `findById`, `findByJobIdAndStatus`, `markSent`, `createPending` — not `findFirst`/`update`. (We're not building a generic ORM wrapper; we're building a domain contract.)
3. **Method args are domain types** (the existing `@coldjot/types` shapes), not Prisma `WhereInput`. Return types are also domain types or `null`. The Prisma impl translates.
4. **No leak of `@prisma/client` types through the interface.** If a method would return a Prisma row, return a hand-written interface instead (often already defined in `@coldjot/types`).
5. **Interfaces live in `.ts` files with no imports from `@prisma/client` or `@coldjot/database`.** This is enforced by a lint rule we'll add (Step 1.6).

## Step-by-step

### Step 1.1 — Adapter interfaces (no impls yet)

Create `adapters/mail-transport.ts`:

```ts
import type { gmail_v1 } from "googleapis";
import type { EmailLabelEnum } from "@coldjot/types";

export interface SendMessageInput {
  userId: string;            // "me" for Gmail
  raw: string;               // base64url RFC822
  threadId?: string;
}
export interface SendMessageResult {
  id: string;
  threadId?: string;
}
export interface InsertMessageInput {
  userId: string;
  raw: string;
  threadId?: string;
  labelIds: string[];        // e.g. [EmailLabelEnum.SENT]
}
export interface MessageDetails {
  messageId: string | undefined;
  subject: string | undefined;
  threadId: string | undefined;
  headers: gmail_v1.Schema$MessagePartHeader[];
}

export interface MailTransport {
  /** Send a message; returns Gmail's assigned id + threadId. */
  send(input: SendMessageInput): Promise<SendMessageResult>;
  /** Insert a message into a folder (used for the untracked sent copy). */
  insert(input: InsertMessageInput): Promise<{ id: string }>;
  /** Delete a message (used to remove the tracked original from sent). */
  delete(id: string): Promise<void>;
  /** Fetch a sent message's headers — used to recover the real Message-ID. */
  getSentDetails(id: string): Promise<MessageDetails>;
  /** Get a gmail client bound to a user+mailbox (for thread-info fetches). */
  getClient(userId: string, mailboxId: string): Promise<gmail_v1.Gmail>;
}
```

Create `adapters/inbox-source.ts`:

```ts
import type { GmailHistoryRecord, MessageDetails } from "@coldjot/types";

export interface FetchHistoryInput {
  startHistoryId: string;
  accessToken: string;
}
export interface FetchHistoryResult {
  history: GmailHistoryRecord[];
  nextPageToken?: string;
  historyId: string;
}
export interface FetchMessageInput {
  messageId: string;
  accessToken: string;
  mailbox: { id: string; email: string };
}

export interface InboxSource {
  fetchHistory(input: FetchHistoryInput): Promise<FetchHistoryResult | null>;
  fetchMessage(input: FetchMessageInput): Promise<MessageDetails | null>;
  /** Refresh token if needed; returns a valid access token or null. */
  getValidAccessToken(mailbox: {
    id: string; userId: string; accessToken: string; refreshToken: string; expiryDate: number;
  }): Promise<string | null>;
}
```

Create `adapters/clock.ts`:

```ts
export interface Clock { now(): Date; }
```

Create `adapters/pubsub-client.ts`:

```ts
import type { PubSubMessage } from "@coldjot/types";
export interface PubSubClient {
  initialize(): Promise<void>;
  startListening(handler: (m: PubSubMessage) => Promise<void>): Promise<void>;
  stopListening(): Promise<void>;
}
```

**Verify:** `tsc --noEmit` green. No production file imports these yet.

### Step 1.2 — Repository interfaces

For each repository, derive the interface **by reading current call sites**. Don't guess — `grep` for `prisma.<model>.` and extract the actual operations.

Worked example — `EmailTrackingRepository`:

Current call sites (from grep):
- `services/jobs/email/processor.ts:71` — `findFirst({ where: { jobId, status }, select: { id } })`
- `lib/email/index.ts:259` — `update({ where: { id }, data: { messageId, threadId, status, subject, events: { create: ... } } })`
- `lib/tracking/index.ts:66` — `create({ data: { hash, userId, ... } })`
- `lib/tracking/index.ts:93` — `findUnique({ where: { hash } })`
- `lib/tracking/index.ts:110` — `update({ where: { hash }, data: { status, openCount: {increment}, openedAt } })`
- `lib/tracking/index.ts:610` — `findUnique({ where: { hash }, include: { events: { where: { type } } } })`

Interface:

```ts
// repositories/email-tracking.repo.ts
import type { EmailTracking, EmailTrackingMetadata, EmailEventEnum } from "@coldjot/types";

export interface CreatePendingInput {
  hash: string;
  userId: string;
  sequenceId: string;
  stepId: string;
  contactId: string;
  subject?: string;
  jobId?: string;
  metadata: Record<string, unknown>;
}
export interface EmailTrackingWithOpenEvents extends EmailTracking {
  events: { id: string }[];   // OPENED events only
}
export interface SentDetails {
  messageId?: string;
  threadId?: string;
  untrackedMessageId?: string;
}

export interface EmailTrackingRepository {
  createPending(input: CreatePendingInput): Promise<EmailTracking>;
  findByHash(hash: string): Promise<EmailTracking | null>;
  findByJobIdAndStatus(jobId: string, status: string): Promise<{ id: string } | null>;
  findWithOpenEvents(hash: string): Promise<EmailTrackingWithOpenEvents | null>;
  findWithLink(hash: string, linkId: string): Promise<EmailTracking | null>;
  markSent(trackingId: string, details: SentDetails, subject: string, sequenceId: string, contactId: string): Promise<void>;
  recordOpen(hash: string, isFirstOpen: boolean): Promise<void>;
  recordClick(trackingId: string): Promise<void>;
  setStatus(id: string, status: EmailTrackingEnum | EmailEventEnum): Promise<void>;
}
```

Notice: `markSent` hides the nested `events.create.type = SENT` write — that's domain logic the caller shouldn't restate.

**Do the same for every other repository.** Each is one file, ~30–80 lines.

### Step 1.3 — Prisma implementations

One file per repo under `repositories/prisma/`. Each is a thin delegator that *copies* the exact Prisma call from its current call site, unchanged.

```ts
// repositories/prisma/prisma-email-tracking.repo.ts
import { prisma } from "@coldjot/database";
import type { EmailTrackingRepository, CreatePendingInput, SentDetails } from "../email-tracking.repo";
import { EmailTrackingStatusEnum, EmailEventEnum } from "@coldjot/types";

export class PrismaEmailTrackingRepository implements EmailTrackingRepository {
  async createPending(input: CreatePendingInput) {
    return prisma.emailTracking.create({
      data: {
        hash: input.hash, userId: input.userId, sequenceId: input.sequenceId,
        stepId: input.stepId, contactId: input.contactId, subject: input.subject,
        jobId: input.jobId, status: "pending", openCount: 0, createdAt: new Date(),
        metadata: input.metadata,
      },
    });
  }
  async findByHash(hash: string) { return prisma.emailTracking.findUnique({ where: { hash } }); }
  // … etc — copy each call verbatim from its original location …
  async markSent(trackingId, details, subject, sequenceId, contactId) {
    await prisma.emailTracking.update({
      where: { id: trackingId },
      data: {
        messageId: details.messageId, threadId: details.threadId,
        status: EmailTrackingStatusEnum.SENT, subject,
        events: { create: {
          type: EmailEventEnum.SENT, sequenceId, contactId,
          metadata: { messageId: details.messageId ?? "", ...details, stepId: ... },
        } },
      },
    });
  }
}
```

**Rule:** the Prisma impl is the *only* place `prisma.*` appears in the new tree. Phase 3 verifies this with grep.

### Step 1.4 — Domain service interfaces

These declare what the domain *does*, not how. The methods mirror the public surface of today's classes — Phase 4 replaces the impls.

```ts
// services/domain/tracking.service.ts
import type { EmailEventType, EmailEventMetadata } from "@coldjot/types";
export interface TrackingService {
  handleEmailOpen(hash: string): Promise<void>;
  handleLinkClick(hash: string, linkId: string): Promise<string>;
  trackEmailEvent(input: { trackingId: string; eventType: EmailEventType; metadata?: EmailEventMetadata }): Promise<void>;
}
```

```ts
// services/domain/send-email.service.ts
import type { SendEmailOptions, EmailResult } from "@coldjot/types";
export interface SendEmailService {
  send(options: SendEmailOptions): Promise<EmailResult>;
}
```

```ts
// services/domain/inbox-sync.service.ts
import type { PubSubMessage } from "@coldjot/types";
export interface InboxSyncService {
  handleNotification(message: PubSubMessage): Promise<void>;
}
```

```ts
// services/domain/launch-sequence.service.ts
import type { ProcessingJob } from "@coldjot/types";
export interface LaunchSequenceService {
  launch(sequenceId: string, userId: string): Promise<{ jobId: string; contactCount: number; stepCount: number }>;
  pause(sequenceId: string, userId: string): Promise<void>;
  resume(sequenceId: string, userId: string): Promise<void>;
  reset(sequenceId: string, userId: string): Promise<void>;
}
```

```ts
// services/domain/run-schedule.service.ts
export interface RunScheduleService {
  /** One scheduler tick: find due contacts, enqueue email jobs. */
  tick(): Promise<{ enqueued: number }>;
}
```

### Step 1.5 — Composition root (created, not yet wired into server.ts)

`composition-root.ts` is the *only* file that constructs concrete instances and decides which impl sits behind which interface.

```ts
// composition-root.ts
import { RedisConnection } from "@/services/shared/redis/connection";
import { MemoryMonitor } from "@/services/core/memory/monitor";
import { RateLimitService } from "@/services/core/rate-limit/service";
import { PubSubService } from "@/services/pubsub/client";
import { WatchCleanupService } from "@/services/watch/cleanup";
import { JobManager, createJobManager } from "@/services/jobs/job-manager";
import { ServiceManager } from "@/services/service-manager";

// Repositories
import { PrismaEmailTrackingRepository } from "@/repositories/prisma/prisma-email-tracking.repo";
// … etc …

// Domain services — for Phase 1 these wrap the existing classes (Phase 4 swaps them)
import { EmailService } from "@/lib/email";
import { TrackingService as TrackingServiceImpl } from "@/lib/tracking";
import { PubSubHandler } from "@/services/pubsub/handler";

export interface App {
  redis: RedisConnection;
  memoryMonitor: MemoryMonitor;
  rateLimit: RateLimitService;
  pubsub: PubSubService;
  watchCleanup: WatchCleanupService;
  jobManager: JobManager;
  serviceManager: ServiceManager;
  // repositories:
  emailTracking: EmailTrackingRepository;
  emailEvent: EmailEventRepository;
  // … all of them …
  // domain services:
  sendEmail: SendEmailService;
  tracking: TrackingService;
  inboxSync: InboxSyncService;
  launchSequence: LaunchSequenceService;
  runSchedule: RunScheduleService;
}

export function createApp(): App {
  // Phase 1 only: wire concrete → interface, but DON'T use existing singletons
  // in a new way. Just construct the Prisma repos (they're stateless) and
  // adapter the existing classes behind the domain interfaces.
  const emailTracking = new PrismaEmailTrackingRepository();
  // … etc …

  // Existing classes still constructed the old way (Phase 4 replaces these):
  const sendEmail = new EmailService() satisfies SendEmailService;
  const tracking  = new TrackingServiceImpl() satisfies TrackingService;
  // PubSubHandler doesn't yet implement InboxSyncService — Phase 4c makes it so.
  // For Phase 1, we just construct it; the inboxSync slot gets filled in Phase 4c.

  return { /* … */ };
}
```

**Crucially:** `server.ts` does **not** call `createApp()` yet. The function exists, compiles, and is exercised only by the wiring test (Step 1.7). Production boots exactly as it does today.

### Step 1.6 — Lint guard: keep Prisma out of non-repo files

Add an ESLint `no-restricted-imports` rule scoped to everything *except* `repositories/prisma/` and `composition-root.ts`:

```js
// eslint.config.js — mailops
{
  files: ["src/**/*.ts"],
  ignores: ["src/repositories/prisma/**", "src/composition-root.ts"],
  rules: {
    "no-restricted-imports": ["error", {
      paths: [{ name: "@coldjot/database", message: "Import the repository interface instead. Prisma access belongs only in repositories/prisma/." }],
    }],
  },
}
```

This is **non-blocking** in Phase 1 (set to `"warn"`) because existing code still imports `prisma` everywhere. Phase 3 promotes it to `"error"` as call sites migrate.

### Step 1.7 — Wiring test

`src/__tests__/wiring.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createApp } from "@/composition-root";

describe("composition root", () => {
  it("constructs the full app graph without throwing", () => {
    const app = createApp();
    expect(app.emailTracking).toBeDefined();
    expect(app.sendEmail).toBeDefined();
    // … assert every slot is non-null …
  });
});
```

This test exists only to confirm the wiring is internally consistent. It does **not** boot Redis/PubSub (those are lazily started by `ServiceManager.initialize()`, which the wiring test does not call).

## Definition of done

- [ ] All interface files exist under `adapters/`, `repositories/`, `services/domain/`.
- [ ] All Prisma impl files exist under `repositories/prisma/` and delegate to `prisma` exactly as the original call sites did.
- [ ] `composition-root.ts` exports `createApp()` + `App` type.
- [ ] `wiring.test.ts` passes.
- [ ] **No production import path changed.** `server.ts` is byte-for-byte identical to Phase 0.
- [ ] `tsc --noEmit` clean; ESLint clean (the new `no-restricted-imports` rule is `"warn"` and may light up across the codebase — that's expected; do not fix those warnings in Phase 1).
- [ ] Phase 0 characterization tests still pass unchanged.

## What to commit

- One commit: "phase 1: add adapter + repository + domain-service interfaces".
- One commit: "phase 1: add Prisma repository implementations".
- One commit: "phase 1: add composition root + wiring test".
- One commit: "phase 1: lint rule to keep Prisma out of non-repo files (warn-level)".

## Risks

| Risk | Mitigation |
|---|---|
| Interface drift from reality (a method signature doesn't match what callers actually need) | Phase 3 is the forcing function — every migration of a real call site will catch a mismatch. Fix the interface then; don't over-engineer now. |
| Prisma impl duplicates the call site verbatim, including bugs | That's intentional. Phase 0 characterization tests pin those bugs. Phase 4 may fix them deliberately. |
| The composition root looks useless because nothing uses it | Correct and intentional. It exists so Phase 2–6 have somewhere to migrate *to*. |
