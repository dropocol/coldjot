# Mailops v2 — Status

> **Single source of truth** for the mailops-v2 plan's progress. The
> [`README.md`](./README.md) + [`plan.md`](./plan.md) carry the rationale and
> mechanics; this file tracks *where we are*.
>
> **Picking up mid-step?** Jump to [Resume guide](#resume-guide).
>
> **Legend:** ⬜ Not started · 🟡 In progress · 🟢 Partial (some files done, remainder pending) · ✅ Done · ⏸️ Blocked/Deferred

## At-a-glance

| Step | Sub-plan | Scope | Status | Commit(s) |
|---|---|---|---|---|
| **0** | [Foundation + launch-sequence slice](./0-foundation-slice.md) | Export `Db`; create `domainExtension`; convert 1 service + tests end-to-end | ✅ Done | `b6aa003` |
| **1** | [Remaining domain services](./1-domain-services.md) | inbox-sync, run-schedule, send-email, tracking — add methods to extension | ✅ Done | `73cf559` |
| — | *(extension split into per-aggregate files)* | split `domain-extension.ts` → `domain-extensions/{sequence,email,inbox}.ts` | ✅ Done | `c0012ff` |
| **2** | [Jobs, watch, monitor, controllers, lib](./2-jobs-watch-monitor-controllers-lib.md) | processors, watch, monitor, mailbox/list controllers, lib helpers | ✅ Done | — |
| **3** | [Delete the repository layer](./3-delete-repository-layer.md) | remove `repositories/`, repo tests, fakes, composition-root wiring | ⬜ | — |
| **4** | [Verify + commit](./4-verify-commit.md) | full gate; confirm no repo imports remain | ⬜ | — |

**Architecture:** Prisma `$extends({ model })` extension methods — queries live as named, reusable methods on the db client (`db.sequence.resetToDraft(id)`), defined in `packages/database/src/domain-extensions/` (split by aggregate: `sequence.ts`, `email.ts`, `inbox.ts`), composed into one extension in `domain-extension.ts`.

**Extension method count:** 83 methods across 13 models. All record types in `@coldjot/types`.

**Test coverage:** 124 fast-tier + 137 integration-tier = 261 tests, all green. Every extension method's query logic is covered by the 18 repo test files (88 tests, identical Prisma bodies). 24 methods have additional end-to-end integration coverage via the 5 converted domain services.

**Scope:** Delete 36 repo files + 18 repo tests + ~10 fakes (~65 files). Convert ~17 service/controller/helper files to use `this.db.X.Y()` directly. Move ~6 domain-service unit tests → integration tier. **Zero DB-schema change. Zero behavior change.**

**Estimated total:** 1–2 days. Most of the time is sub-plan 2 (breadth).

## Per-consumer tracker

Update each row as you convert it. A sub-plan flips to ✅ when all its rows are ✅ and `typecheck` + relevant tests are green.

### Domain services (sub-plans 0 + 1)

| File | `db` injected? | Extension methods used? | Type imports cleaned? | Test moved to integration? | Status |
|---|---|---|---|---|---|
| `launch-sequence.service.ts` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `inbox-sync.service.ts` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `run-schedule.service.ts` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `send-email.service.ts` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `tracking.service.ts` | ✅ | ✅ | ✅ | ✅ | ✅ |

### Jobs / watch / monitor (sub-plan 2)

| File | `db` injected? | Extension methods used? | Status |
|---|---|---|---|
| `services/jobs/sequence/processor.ts` | ✅ | ✅ (delegates to service) | ✅ |
| `services/jobs/sequence/helper.ts` | ✅ | ✅ | ✅ |
| `services/jobs/email/processor.ts` | ✅ | ✅ | ✅ |
| `services/jobs/contact/processor.ts` | ✅ | ✅ | ✅ |
| `services/jobs/schedule/processor.ts` | ✅ | ✅ (delegates to service) | ✅ |
| `services/jobs/list/processor.ts` | ✅ | ✅ | ✅ |
| `services/jobs/list/helper.ts` | ✅ | ✅ | ✅ |
| `services/watch/index.ts` | ✅ | ✅ | ✅ |
| `services/watch/cleanup.ts` | ✅ | ✅ | ✅ |
| `services/monitor/service.ts` | ✅ | ✅ | ✅ |

### Controllers (sub-plan 2)

| File | `db` injected? | Extension methods used? | Status |
|---|---|---|---|
| `controllers/mailbox.controller.ts` | ✅ | ✅ | ✅ |
| `controllers/list.controller.ts` | ✅ | ✅ | ✅ |

*(sequence, health, metrics controllers don't query the DB directly — they delegate to services. No change.)*

### Lib helpers (sub-plan 2)

| File | `db` as param? | Extension methods used? | Call sites updated? | Status |
|---|---|---|---|---|
| `lib/email-subject.ts` | ✅ | ✅ | ✅ | ✅ |
| `lib/mailbox/index.ts` | ✅ | ✅ | ✅ | ✅ |
| `lib/stats/index.ts` | ✅ | ✅ | ✅ | ✅ |
| `lib/schedule/index.ts` | ✅ | ✅ | ✅ | ✅ |
| `lib/google/gmail/gmail.ts` | ✅ | ✅ | ✅ | ✅ |

### Composition root (sub-plans 0–3, finalized in 3)

| Milestone | Status |
|---|---|
| `launchSequence` wired with `db` (sub-plan 0) | ✅ |
| Other services wired with `db` (sub-plans 1–2) | 🟡 Domain services done (sub-plan 1); jobs/watch/monitor/controllers pending (sub-plan 2) |
| All `new PrismaXRepository()` lines removed (sub-plan 3) | ⬜ |
| `App` interface `repositories` section removed (sub-plan 3) | ⬜ |

## Foundation tracker (sub-plan 0)

| Task | Status |
|---|---|
| `export type Db = ReturnType<typeof createPrismaClient>` in `@coldjot/database` | ✅ |
| `domainExtension` created in `packages/database/src/domain-extension.ts` | ✅ |
| `domainExtension` composed with encryption extension | ✅ |
| Record types moved to `@coldjot/types` (`SequenceRecord`, `SequenceWithLaunchGraph`, `SequenceWithDetails`) | ✅ |
| `launch-sequence.service.ts` converted to `db.sequence.X()` / `db.businessHours.X()` | ✅ |
| Composition root wires `launchSequence` with `prisma` | ✅ |
| `launch-sequence.service.test.ts` → integration | ✅ (merged into existing `sequence-lifecycle.test.ts`; redundant unit test deleted) |
| `typecheck` + fast tests + integration tests green | ✅ (149 fast + 132 integration) |
| **Decision gate** — pattern feels right? | ✅ User confirmed pivot to extension approach |

## Branch layout

```
refactor/mailops          ← base; Phase 7 complete. UNTOUCHED by this plan.
  └─ refactor/mailops-v2  ← this work. Created off refactor/mailops HEAD (d8e981e).
```

`refactor/mailops` stays exactly as-is — your fallback. All mailops-v2 work
happens on `refactor/mailops-v2`. Each sub-plan is one (or a few) commits; each
commit ends green: `npm run -w mailops typecheck` + relevant tests.

> **Why this branch exists:** you said you want to access the current version
> if needed. `refactor/mailops` is that version. Don't merge `mailops-v2` into
> `mailops` or `master` until you've lived with v2 and confirmed you prefer it.

## Resume guide

**Where we are:** sub-plan ⬜ (nothing started). Start with [sub-plan 0](./0-foundation-slice.md) — it exports the `Db` type and converts one service end-to-end as a pattern proof. **The repo files stay in place until sub-plan 3, so every prior sub-plan leaves the app in a working state.**

```bash
cd "/Volumes/Data/00-My Projects/ColdJot/coldjot"
git checkout refactor/mailops-v2

# after each sub-plan:
npm run -w mailops typecheck
npm run -w mailops test -- <pattern>
```

## Definition of done (for the whole plan)

- [ ] `apps/mailops/src/repositories/` directory no longer exists.
- [ ] `apps/mailops/src/__tests__/repositories/` directory no longer exists.
- [ ] Repo fakes deleted from `__tests__/helpers/fakes/` (adapter fakes kept if still used).
- [ ] `grep -r "@/repositories" apps/mailops/src/` returns no output.
- [ ] All domain services take `db: Db` (no repo deps).
- [ ] Domain-service tests moved to integration tier; passing against Postgres.
- [ ] Pure-helper unit tests (46) still pass, unchanged.
- [ ] `npm run -w mailops typecheck` clean.
- [ ] `npm run -w mailops lint` 0 errors.
- [ ] `npm run -w mailops test` green (fast tier).
- [ ] `npm run -w mailops test:integration` green (needs Postgres).
- [ ] [Per-consumer tracker](#per-consumer-tracker) all ✅.

## Solved pitfalls (don't re-hit these)

1. **Extension method `this` context.** Inside a `$extends({ model })` method, `this` is not the Prisma delegate — it's an opaque extension context. To get the typed delegate for the current model (to call `findUnique`, `update`, etc.), use `const ctx = Prisma.getExtensionContext(this)` and call methods on `ctx`. Type the method's first param as `this: unknown` so callers don't get a confusing typed `this`. See any method in `packages/database/src/domain-extension.ts` for the pattern.

2. **`prisma` is an extended client, not bare `PrismaClient`.** The `@coldjot/database` singleton has TWO composed extensions: token-encryption (`result` + `query` components) and domain methods (`model` component). Always inject the exported `prisma` singleton — never `new PrismaClient()`, which would skip encryption AND have no domain methods. The `Db` type (`ReturnType<typeof createPrismaClient>`) captures both extensions.

2. **`$transaction` callback gets a narrower client.** In `prisma.$transaction(async (tx) => …)`, `tx` is `Prisma.TransactionClient`, not `Db`. Type the callback parameter explicitly. Two files use this today: `lib/stats/index.ts` and `services/domain/tracking.service.ts`.

3. **`$transaction` callback gets a narrower client.** In `prisma.$transaction(async (tx) => …)`, `tx` is `Prisma.TransactionClient`, not `Db`. Type the callback parameter explicitly. Two files use this today: `lib/stats/index.ts` and `services/domain/tracking.service.ts`.

4. **Record types must be preserved.** The `*.repo.ts` files export ~30 auxiliary types (`ContactRecord`, `DueContactGraph`, `MailboxWithAliasesRecord`, etc.) imported by services. When you delete a repo file, these types need a new home (`@coldjot/types` for domain types). Don't lose them. Sub-plan 0 already moved `SequenceRecord` / `SequenceWithLaunchGraph` / `SequenceWithDetails` there.

5. **Processors hard-assign repos in their constructor body.** `services/jobs/email/processor.ts` does `this.emailTracking = new PrismaEmailTrackingRepository()` inside the constructor (not as a param). Convert these to `this.db = db` (injected). Same for any other processor using the legacy default-param pattern.

6. **The encryption extension needs `ENCRYPTION_KEY`.** Integration tests already set this in `__tests__/setup.ts`. If you add new Mailbox-writing integration tests, ensure setup is loaded.

7. **Copy the repo's exact query into the extension method.** Repos sometimes `findFirst`, sometimes `findUnique`, sometimes cast with `as unknown as T`. Lift the repo's body verbatim into the extension method — don't reinvent it. The repo file is the spec until you delete it.

8. **Don't convert + delete in the same sub-plan.** Sub-plans 0–2 convert consumers while the repo files still exist (so unconverted code keeps compiling). Sub-plan 3 deletes the repo files only after every consumer is off them. If you delete early, you'll break compilation for any consumer you missed.

9. **Integration tests share one DB.** `vitest.integration.config.ts` sets `fileParallelism: false` + `pool: "forks"`. Scope any `deleteMany`/`truncate` by the suite's own id prefix or `sequenceId` — don't issue blanket deletes that trip FKs from rows another suite seeded. (Existing pitfall from the test-suite plan; still applies.)

## Relationship to other plans

- **`plans/mailops-consolidation/`** — orthogonal. That plan may fold `apps/mailops` into `apps/web` entirely. This v2 plan makes the repo layer simpler *regardless*; if consolidation proceeds, a Prisma-direct layer is easier to port than a repository layer. Safe to do this first.
- **`plans/refactor-plan/`** — the security/quality audit. Phase 7 (test suite) is complete. This v2 plan restructures code but doesn't change behavior, so the security work stands.
- **`plans/mailops-v2/` supersedes `plans/repo-collapse/`** (deleted). The collapse plan kept the seam and merged two files into one; this plan removes the seam entirely, which is what you actually want.
