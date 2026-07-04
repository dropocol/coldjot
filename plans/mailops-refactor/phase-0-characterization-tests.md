# Phase 0 — Characterization Tests (the safety net)

> **Goal:** before touching any production code, capture the *current* behavior of the three god-objects so we can prove every later phase preserves it. These tests are **not** "good unit tests" — they pin what the code does *today*, whether or not that's ideal.
>
> **Branch:** `refactor/mailops-phase0` (off `upgrade/remaining-majors`)
> **Estimated effort:** 1–2 days
> **Behavior change:** none — code is untouched; only tests added.

## Why this phase exists

There are zero tests under `apps/mailops/` today. The refactor plan moves ~3,000 lines of business logic across files. Without a net, "did I break anything?" becomes "did I read carefully enough?" — which is exactly what you said you can't verify by running the live system.

A characterization test answers one question: **given this input, does the code still produce the same output?** If yes, the move was safe. The assertions are on observable surfaces (DB rows written, jobs enqueued, transport calls made) — never on internal call order.

## Approach

- **Vitest** — `plans/testing/01-testing-baseline.md` already picks Vitest; reuse it. Add it to `apps/mailops` (devDependency) and a `test` script.
- **No Prisma singleton mocking via module replacement** (fragile). Instead, Phase 1 introduces constructor injection. For Phase 0, **before that injection exists**, use a two-step trick:
  1. Write the test against the *current* exported class (e.g. `emailService`).
  2. Use `vi.mock("@coldjot/database", ...)` to swap `prisma` for an in-memory fake that records calls. Provide a minimal in-memory implementation (a plain object with `Map`s keyed by model name) — only the methods the code path actually calls.
  3. Mock `googleapis` similarly — record `users.messages.send` / `.get` / `.insert` / `.delete` calls and return canned responses.
- **Each test asserts on three surfaces:**
  1. **DB rows written** — which Prisma `create`/`update` calls were made, with what data.
  2. **Transport calls** — which Gmail/SMTP methods were invoked, with what args.
  3. **Jobs enqueued** — for the ScheduleProcessor test only.

## Files to create

```
apps/mailops/
├── vitest.config.ts                              — Vitest config (Node env, alias "@/" → "./src")
├── src/__tests__/
│   ├── setup.ts                                  — loads env, sets NODE_ENV=test
│   └── characterization/
│       ├── email-service.test.ts                 — EmailService.sendEmail (Phase 0a)
│       ├── tracking-service.test.ts              — TrackingService + standalone fns (Phase 0b)
│       ├── pubsub-handler.test.ts                — PubSubHandler.handleNotification (Phase 0c)
│       └── schedule-processor.test.ts            — ScheduleProcessor (Phase 0d)
└── src/__tests__/helpers/
    ├── fake-prisma.ts                            — in-memory Prisma stub (records all calls)
    └── fake-gmail.ts                             — canned gmail_v1.Gmail stub
```

## Step-by-step

### Step 0.1 — Wire Vitest into mailops

- `apps/mailops/package.json`: add `"vitest": "^2.x"` to devDeps; set `"test": "vitest run"` and `"test:watch": "vitest"`.
- Create `apps/mailops/vitest.config.ts`:
  ```ts
  import { defineConfig } from "vitest/config";
  import path from "node:path";
  export default defineConfig({
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
    test: { environment: "node", setupFiles: ["./src/__tests__/setup.ts"] },
  });
  ```
- `src/__tests__/setup.ts`: set `process.env.NODE_ENV = "test"`, load `.env.test` if present, ensure `MAILOPS_PUBSUB_ENABLED=false`.

**Verify:** `npm test --filter mailops` runs (zero tests pass — that's fine).

### Step 0.2 — Build the fakes

**`helpers/fake-prisma.ts`** — a minimal Prisma stub. Don't reimplement Prisma; record calls.

```ts
type ModelName = "emailTracking" | "emailEvent" | "trackedLink" | "linkClick"
  | "sequenceStats" | "sequenceContact" | "sequence" | "sequenceStep"
  | "mailbox" | "emailWatch" | "emailWatchHistory" | "processedMessage"
  | "businessHours" | "template" | "contact" | "emailThread";

interface RecordedCall { model: ModelName; op: string; args: any; }

export function makeFakePrisma() {
  const calls: RecordedCall[] = [];
  const stores: Record<ModelName, Map<string, any>> = /* ...one Map per model */;
  const handler: ProxyHandler<...> = {
    get: (_, model: ModelName) => new Proxy({}, {
      get: (_, op: string) => async (args: any) => {
        calls.push({ model, op, args });
        // Minimal real behavior for the ops the code paths use:
        //   .create → push into store, return the row
        //   .update / .findFirst / .findUnique → look up in store
        //   .$transaction → run the callback with the same fake
        return /* ... */;
      },
    }),
  };
  return { prisma: new Proxy({} as any, handler), calls, stores };
}
```

The key principle: **the fake only needs to behave correctly for the specific code path under test.** Each test seeds the stores with the rows that path will look up; everything else can return `null`.

**`helpers/fake-gmail.ts`** — a `gmail_v1.Gmail` stub:

```ts
export function makeFakeGmail(responses: {
  send?: Partial<gmail_v1.Schema$Message>;
  get?: Partial<gmail_v1.Schema$Message>;
  insert?: Partial<gmail_v1.Schema$Message>;
}) {
  const calls: any[] = [];
  const users = { messages: {
    send: async (a: any) => { calls.push({ op: "send", a }); return { data: responses.send ?? { id: "msg-1", threadId: "thr-1" } }; },
    get:   async (a: any) => { calls.push({ op: "get", a });   return { data: responses.get ?? { /* canned headers */ } }; },
    insert:async (a: any) => { calls.push({ op: "insert", a });return { data: responses.insert ?? { id: "msg-2" } }; },
    delete:async (a: any) => { calls.push({ op: "delete", a });return {}; },
  }};
  return { gmail: { users } as unknown as gmail_v1.Gmail, calls };
}
```

### Step 0.3 — Phase 0a: `email-service.test.ts`

Pin `lib/email/index.ts:46 EmailService.sendEmail` behavior. **Three cases:**

1. **Tracked send (happy path)** — `options.disableSending = false`. Seed: `gmail.users.messages.send` returns `{id:"msg-1", threadId:"thr-1"}`; `users.messages.get` returns a payload with `Message-ID` + `Subject` headers. Assert:
   - `prisma.emailTracking.update` called once with `where.id = options.tracking.id`, `data.status = "SENT"`, nested `events.create.type = "SENT"`.
   - `updateSequenceStats` called with `(sequenceId, SENT, contactId)`.
   - `gmail.users.messages.insert` called once (untracked copy).
   - `gmail.users.messages.delete` called once with the original `id`.
   - Returns `{success: true, messageId: "msg-1", threadId: "thr-1"}`.

2. **Disable-sending path** — `options.disableSending = true`. Assert:
   - `updateEmailTracking` + `createEmailEvent` called with fake IDs (`fake-msg-<ts>`, `fake-thread-<ts>`).
   - **No** Gmail send/insert/delete calls.
   - Returns `{success: true, isFake: true}`.

3. **Auth-failure throws TOKEN_EXPIRED** — seed `gmail.users.messages.send` to throw `{ status: 401 }`. Assert the thrown error message equals `"TOKEN_EXPIRED"`.

Mock surface: `vi.mock("@coldjot/database")`, `vi.mock("@/lib/google")` (so `gmailClientService.getClient` returns the fake), `vi.mock("@/lib/stats")` (so `updateSequenceStats` is a spy).

### Step 0.4 — Phase 0b: `tracking-service.test.ts`

Pin both surfaces (they will collapse into one in Phase 4a — we need to know they currently agree):

1. **`TrackingService.handleEmailOpen(hash)` — first open** — seed store: one `emailTracking` row with `hash`, `openCount: 0`, no prior `OPENED` event. Assert:
   - `emailTracking.update`: `openCount: { increment: 1 }`, `openedAt: <set>`, `status: "OPENED"`, nested `events.create.type = "OPENED"`, `metadata.isFirstOpen = true`.
   - `updateSequenceStats(sequenceId, OPENED, contactId, {isUniqueOpen: true})`.

2. **`handleEmailOpen` — repeat open** — seed: same row + one existing `OPENED` event. Assert:
   - `openCount: { increment: 1 }` still happens.
   - **But** nested `events.create` still fires (current behavior — note this; Phase 4a may change it intentionally).
   - `updateSequenceStats` called with `{isUniqueOpen: false}`.

3. **`TrackingService.handleLinkClick(hash, linkId)` — happy path** — seed: `emailTracking` + one matching `trackedLink` with `originalUrl`. Assert:
   - `$transaction` ran; inside it: `linkClick.create`, `trackedLink.update` (`clickCount: { increment: 1 }`), `emailTracking.update` (nested `events.create.type = "CLICKED"`).
   - `updateSequenceStats(CLICKED)`.
   - Returns `link.originalUrl`.

4. **`recordEmailOpen(hash)` standalone fn** — same scenario as case 1, but call the **exported function**, not the class. Pin its behavior separately. (Phase 4a will delete this duplicate; the test documents what it did.)

5. **`createEmailTracking(metadata)` — happy + missing-field** — happy path: assert the created row's `status = "pending"`, `hash = <48-char nanoid>`, `jobId` is stamped. Missing-field path: throw with message listing missing fields.

6. **`trackEmailEvent(trackingId, type, metadata, trackingData)` — SENT path** — pin the inline stats math (lines 449–500 of `lib/tracking/index.ts`): given `stats = {sentEmails: 4, openedEmails: 2, ...}`, assert `updates.openRate = (2/5)*100 = 40`. This is the *only* test that pins the rate math — it will catch any drift when Phase 4a consolidates the two stats strategies.

### Step 0.5 — Phase 0c: `pubsub-handler.test.ts`

Pin `services/pubsub/handler.ts:63 PubSubHandler.handleNotification` for the three classification outcomes. Mock: `fetch` (global), `refreshTokenIfNeeded`, the prisma fake, `updateSequenceStats`.

Seed per case: a watch record + a canned `fetchGmailHistory` response containing one `messagesAdded` entry.

1. **Reply path** — message details have `from` ≠ any user email, `in-reply-to` header present. Assert:
   - `EmailEvent` created with `type = "REPLIED"`.
   - `SequenceContact.status` updated (per `determineNewStatus`).
   - `updateSequenceStats(REPLIED)`.

2. **Bounce path** — headers contain `x-failed-recipients`. Assert:
   - `EmailEvent` created with `type = "BOUNCED"`.
   - `SequenceContact.status` updated to bounced/opted-out (whatever current code does — *pin it*).
   - `updateSequenceStats(BOUNCED)`.

3. **Original-message / no-op path** — message from the user's own mailbox. Assert: **no** EmailEvent, **no** SequenceContact update.

4. **Already-processed** — `isMessageProcessed` returns true. Assert: skip, no further calls.

### Step 0.6 — Phase 0d: `schedule-processor.test.ts`

Pin `services/jobs/schedule/processor.ts` ScheduleProcessor: given a set of `SequenceContact` rows with `nextScheduledAt` in the past and `status = IN_PROGRESS`, assert:
- N `EmailJob`s enqueued (via a fake `JobManager` that records `addEmailJob` calls).
- Each enqueued job's `data` carries the right `sequenceId`, `contactId`, `stepId`, `delay`.

Mock: prisma fake (seed contacts), `JobManager` fake. Don't run real BullMQ workers.

## Definition of done

- [ ] `npm test` in `apps/mailops` runs and all characterization tests pass against **unchanged** production code.
- [ ] The `fake-prisma.ts` + `fake-gmail.ts` helpers are reusable (Phase 1+ tests will reuse them once constructor injection lands).
- [ ] Each god-object has ≥ 3 pinned cases.
- [ ] The rate-math test (0b case 6) exists — it's the canary for Phase 4a.
- [ ] No production file modified (only `package.json` for the vitest dep + the new test files).

## Risks

| Risk | Mitigation |
|---|---|
| Faking Prisma precisely is tedious | Only fake what the code path calls. Unknown ops can throw — that surfaces missing cases as test failures rather than silent passes. |
| A test pins *buggy* behavior | That's fine and *intended*. Add a `// TODO(behavior):` comment. Phase 4 may deliberately change behavior — at that point the test gets updated in the same commit that changes the behavior, with a clear before/after in the message. |
| Vitest + ESM + `tsx` alias conflicts | Use Vitest's `resolve.alias` (shown above), not `tsconfig` paths. Vitest resolves at runtime. |

## What to commit

One commit per step (0.1, 0.2, then one per test file 0.3–0.6). Each leaves `tsc --noEmit` + lint + tests green.
