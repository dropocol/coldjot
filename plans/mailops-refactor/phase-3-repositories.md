# Phase 3 — Extract Repositories; Isolate Prisma

> **Goal:** every Prisma call now lives behind a repository from Phase 1. Domain code depends on `EmailTrackingRepository`, not on `prisma.emailTracking.create(...)`. The repository is *injected* via constructor.
>
> **Branch:** `refactor/mailops-phase3` (off Phase 2 branch)
> **Estimated effort:** 3–4 days
> **Behavior change:** zero. Each Prisma call is moved verbatim into the matching `Prisma*Repository` method (created in Phase 1). Callers swap `prisma.X.op(args)` for `repo.methodName(args)`.

## Why this phase exists

Phase 1 wrote the interfaces + Prisma impls by *copying* the existing calls. Phase 2 moved route logic into controllers but they still import `prisma` directly. Phase 3 is the migration: **swap every direct `prisma.*` call for a repository method, and pass repositories in via constructor.**

After Phase 3:
- `grep -r "prisma\." apps/mailops/src` returns matches only inside `repositories/prisma/*` and `composition-root.ts`.
- Domain code (controllers, processors, lib services) is DB-agnostic. You could swap Prisma for Drizzle by writing new impls in `repositories/drizzle/*` and changing one line in `composition-root.ts`.
- Phase 0 characterization tests can inject the in-memory fake prisma *without module mocking* — just construct the service with `new FakeEmailTrackingRepository()`.

## Migration strategy

**One aggregate at a time.** Each step migrates exactly one repository's worth of call sites, in isolation. Order chosen by simplicity (build muscle memory on the easy ones) and risk (do the highest-risk god-object last):

| Step | Aggregate | Call sites | Risk |
|---|---|---|---|
| 3.1 | `EmailTracking` | `lib/email`, `lib/tracking`, `services/jobs/email` | medium |
| 3.2 | `EmailEvent` | `lib/tracking`, `services/pubsub/handler` | medium |
| 3.3 | `TrackedLink` + `LinkClick` | `lib/tracking` only | low |
| 3.4 | `SequenceStats` | `lib/stats`, `lib/tracking` (the duplicate path) | medium |
| 3.5 | `SequenceContact` | `services/jobs/email`, `services/jobs/sequence`, `services/pubsub/handler` | medium |
| 3.6 | `Sequence` + `SequenceStep` + `BusinessHours` | `controllers/sequence`, `services/jobs/email` | low |
| 3.7 | `Mailbox` + `EmailAlias` | `services/pubsub/handler`, `lib/mailbox`, `lib/google` | low |
| 3.8 | `EmailThread` | `services/jobs/email`, `services/pubsub/handler` | low |
| 3.9 | `EmailWatch` + `EmailWatchHistory` + `ProcessedMessage` | `services/pubsub/handler` | high (biggest file) |
| 3.10 | `Template` + `Contact` + `EmailList` | `services/jobs/email`, `services/jobs/contact`, `services/jobs/list` | low |

Each step ends with `tsc` green + characterization tests green + the `no-restricted-imports` rule (Phase 1, `warn`) showing fewer warnings for that aggregate.

## Per-step recipe (apply to every step 3.1–3.10)

For aggregate `Foo`:

1. **Reconcile interface vs reality.** Open `repositories/foo.repo.ts` (from Phase 1). `grep -rn "prisma\.\(foo\)\." apps/mailops/src` (case-insensitive, both singular and plural — Prisma model names are exactly as in `schema.prisma`). For each call site, confirm a matching method exists on the interface. Add missing methods to the interface + impl now — don't migrate half a call site.

2. **Make the impl faithful.** Open `repositories/prisma/prisma-foo.repo.ts`. For each method, confirm the body is the **exact** Prisma call the original call site made (same `where`, `data`, `include`, `select`). If Phase 1 missed a nuance, copy it now.

3. **Inject via constructor.** For each class/file that calls `prisma.foo.*`:
   - Add a `private readonly foo: FooRepository` constructor parameter.
   - In `composition-root.ts`, pass the `PrismaFooRepository` instance into the constructor.
   - For files that aren't classes (e.g. `lib/tracking/index.ts`'s standalone exports), either: (a) convert to a class with constructor injection, or (b) accept the repository as a function parameter and have the composition root bind it. **Prefer (a)** for code that's part of a domain service; Phase 4 will turn these into proper service classes anyway.

4. **Migrate call sites one at a time.** Within the file, replace each `prisma.foo.op(args)` with `this.foo.methodName(args)`. **Diff each replacement line-by-line** to confirm the args match what the impl expects.

5. **Run characterization tests.** They must stay green. If one breaks, the impl diverged from the original call — fix the impl, not the test.

6. **Promote the lint rule.** Once an aggregate is fully migrated, change `no-restricted-imports` from `warn` to `error` *for the files that used to import prisma for that aggregate*. (Practical approach: leave the rule at `warn` globally until 3.10 is done, then flip to `error` in the final commit. The warning count dropping to zero across commits is the progress signal.)

## Worked example — Step 3.1: `EmailTracking`

**Step 3.1.1 — Reconcile.** Grep finds these call sites:

| File:line | Call | Maps to method |
|---|---|---|
| `services/jobs/email/processor.ts:71` | `prisma.emailTracking.findFirst({ where: { jobId, status }, select: { id } })` | `findByJobIdAndStatus(jobId, status)` ✓ (already in interface) |
| `lib/email/index.ts:259` (now in `controllers/...` or still in lib — wherever Phase 2 left it) | `prisma.emailTracking.update({ where: { id }, data: { ...events.create... } })` | `markSent(...)` ✓ |
| `lib/tracking/index.ts:66` | `prisma.emailTracking.create({ data: { hash, userId, ... } })` | `createPending(...)` ✓ |
| `lib/tracking/index.ts:93` | `prisma.emailTracking.findUnique({ where: { hash } })` | `findByHash(hash)` ✓ |
| `lib/tracking/index.ts:110` | `prisma.emailTracking.update({ where: { hash }, data: { status, openCount: {increment}, openedAt } })` | `recordOpen(hash, isFirstOpen)` ✓ |
| `lib/tracking/index.ts:610` | `prisma.emailTracking.findUnique({ where: { hash }, include: { events: { where: { type } } } })` | `findWithOpenEvents(hash)` ✓ |
| `lib/tracking/index.ts:672` (in `TrackingService.handleLinkClick`) | `prisma.emailTracking.findUnique({ where: { hash }, include: { links: { where: { id } } } })` | **NEW** — `findWithLink(hash, linkId)` |

Add the missing method to the interface + impl.

**Step 3.1.2 — Inject.** The two consumers are `EmailService` (class — easy) and `lib/tracking/index.ts` (mixed class + standalone fns).

For `EmailService`:
```ts
// lib/email/index.ts
export class EmailService {
  constructor(private readonly emailTracking: EmailTrackingRepository) {}
  // …
}
```
And `composition-root.ts`:
```ts
const emailTracking = new PrismaEmailTrackingRepository();
const sendEmail = new EmailService(emailTracking) satisfies SendEmailService;
```

For `lib/tracking/index.ts`'s **standalone** exports (`createEmailTracking`, `recordEmailOpen`, `recordLinkClick`, `trackEmailEvent`, `updateTrackingStats`): these will be deleted in Phase 4a, but for Phase 3 they must still work. Convert them to thin wrappers that read from a module-level singleton that the composition root sets:
```ts
// lib/tracking/index.ts
let _emailTracking: EmailTrackingRepository;
export function _setTrackingRepo(repo: EmailTrackingRepository) { _emailTracking = repo; }

export async function createEmailTracking(metadata: EmailTrackingMetadata) {
  // body unchanged except: prisma.emailTracking.create → _emailTracking.createPending
}
```
`composition-root.ts` calls `_setTrackingRepo(emailTracking)` after construction. **This is a deliberate stopgap** — Phase 4a removes these standalone functions entirely once the `TrackingService` class is the only entry point.

**Step 3.1.3 — Migrate.** Replace each call site, diff each line, run tests.

**Step 3.1.4 — Verify.** `grep -rn "prisma\.emailTracking\." apps/mailops/src` returns matches only inside `repositories/prisma/prisma-email-tracking.repo.ts`. ✓

Repeat for 3.2–3.10.

## The hard one — Step 3.9: PubSub handler's Prisma usage

`services/pubsub/handler.ts` (1,366 lines) touches `EmailWatch`, `EmailWatchHistory`, `ProcessedMessage`, `EmailEvent`, `SequenceContact`, `EmailThread`, `Mailbox`. By the time you reach 3.9, the `EmailEvent`/`SequenceContact`/`EmailThread`/`Mailbox` repos already exist (from 3.2, 3.5, 3.8, 3.7). 3.9 adds only the three PubSub-specific repos.

`PubSubHandler` becomes:
```ts
export class PubSubHandler {
  constructor(
    private readonly emailWatch: EmailWatchRepository,
    private readonly emailWatchHistory: EmailWatchHistoryRepository,
    private readonly processedMessage: ProcessedMessageRepository,
    private readonly emailEvent: EmailEventRepository,
    private readonly sequenceContact: SequenceContactRepository,
    private readonly emailThread: EmailThreadRepository,
    private readonly stats: SequenceStatsRepository,        // for updateSequenceStats
    private readonly inboxSource: InboxSource,              // for fetchHistory/fetchMessage
  ) {}
  // … 1,366 lines of method bodies, with prisma.X.op → this.X.method …
}
```

That's 8 constructor params — at the upper limit of comfort. **Phase 4c collapses this class entirely.** For Phase 3, the goal is just to make it DB-agnostic; the size is accepted temporarily.

> The `inboxSource` parameter is interesting — it replaces the inline `fetch()` calls + `refreshTokenIfNeeded` (lines 506–674 of `handler.ts`). The Phase 1 `InboxSource` interface covers it; the concrete impl (`GmailInboxSource`) is created in Phase 4c. For Phase 3, leave the `fetch()` calls inline and only migrate the *Prisma* ones — i.e. inject only the repositories. Note this in a `// TODO(phase-4c):` comment.

## Updating the composition root

After every step, `composition-root.ts` grows by one `const foo = new PrismaFooRepository();` line and one more constructor argument somewhere. By the end of Phase 3, the root looks like:

```ts
export function createApp(): App {
  const emailTracking = new PrismaEmailTrackingRepository();
  const emailEvent = new PrismaEmailEventRepository();
  const trackedLink = new PrismaTrackedLinkRepository();
  const linkClick = new PrismaLinkClickRepository();
  const sequenceStats = new PrismaSequenceStatsRepository();
  const sequenceContact = new PrismaSequenceContactRepository();
  const sequence = new PrismaSequenceRepository();
  const sequenceStep = new PrismaSequenceStepRepository();
  const businessHours = new PrismaBusinessHoursRepository();
  const mailbox = new PrismaMailboxRepository();
  const emailThread = new PrismaEmailThreadRepository();
  const emailWatch = new PrismaEmailWatchRepository();
  const emailWatchHistory = new PrismaEmailWatchHistoryRepository();
  const processedMessage = new PrismaProcessedMessageRepository();
  const template = new PrismaTemplateRepository();
  const contact = new PrismaContactRepository();

  const sendEmail = new EmailService(emailTracking, emailEvent, sequenceStats);
  const tracking = new TrackingServiceImpl(emailTracking, emailEvent, trackedLink, linkClick, sequenceStats);
  _setTrackingRepos(emailTracking, trackedLink, linkClick, sequenceStats, emailEvent); // stopgap for standalone fns
  // … etc …

  return { /* all slots populated */ };
}
```

## Updating the characterization tests

Phase 0 used `vi.mock("@coldjot/database")`. Phase 3 lets tests inject fakes directly:

```ts
// email-service.test.ts — Phase 3 version
const emailTracking = makeFakeEmailTrackingRepository();   // implements the interface, records calls
const emailEvent = makeFakeEmailEventRepository();
const stats = makeFakeSequenceStatsRepository();
const service = new EmailService(emailTracking, emailEvent, stats);
```

The `helpers/fake-prisma.ts` from Phase 0 gets refactored into per-repository fakes (`helpers/fakes/email-tracking.fake.ts`, etc.) that implement the repository interfaces. **The assertions don't change** — only how the fake is wired in. Update each test file mechanically as you migrate its aggregate.

## Definition of done

- [ ] `grep -rn "from \"@coldjot/database\"" apps/mailops/src` returns matches only inside `repositories/prisma/*` and `composition-root.ts`.
- [ ] `grep -rn "prisma\." apps/mailops/src` returns matches only inside `repositories/prisma/*` and `composition-root.ts`.
- [ ] Every domain class takes its repositories via constructor.
- [ ] The Phase 1 `no-restricted-imports` rule is promoted to `"error"`. CI is clean.
- [ ] Phase 0 characterization tests still pass, now wired with repository fakes instead of module mocks.
- [ ] `tsc --noEmit` clean; ESLint clean.
- [ ] `server.ts` still boots and serves the same HTTP contract.

## What to commit

One commit per step (3.1 through 3.10). Each commit's diff should be readable in one sitting: the new repo method bodies are move-only, the call-site changes are mechanical `prisma.X.op → this.X.method`, and the composition-root edit is one or two lines.

Final commit: "phase 3: promote no-restricted-imports to error".

## Risks

| Risk | Mitigation |
|---|---|
| A repository method subtly diverges from the original Prisma call (forgotten `include`, wrong `select`) | Diff line-by-line during migration. Characterization tests catch divergences that produce different rows. For `select` shape drift (which doesn't change writes), add a quick assertion that the returned object has the fields the caller reads. |
| The standalone-function stopgap in `lib/tracking` feels hacky | It is. It exists only to bridge Phase 3 → Phase 4a. Don't extend the pattern to other files; for everything else, use constructor injection on a class. |
| `PubSubHandler`'s 8 constructor params feel wrong | They are — and Phase 4c fixes it by splitting the class. For Phase 3, accept it. |
| Tests need rewiring mid-phase | Each step's commit updates only the test files that exercise that aggregate. Tests for other aggregates keep using `vi.mock` until their step lands. |
