# 2 — Jobs, watch, monitor, controllers, lib helpers

> **Goal:** convert the remaining repo consumers — processors, watch, monitor,
> mailbox/list controllers, and lib helpers — to `db: Db` + extension methods.
>
> **Status:** ⬜ Not started · 🟡 In progress · ✅ Done — _(update STATUS.md when you flip this)_

## Prerequisite

Sub-plans 0 + 1 complete — all domain services use `db`. The repo files still
exist; this sub-plan converts the last consumers so sub-plan 3 can delete them.

## Consumers to convert

### Processors (`services/jobs/`)

| File | Repos today | Notes |
|---|---|---|
| `sequence/processor.ts` | (check — likely delegates to helper) | BullMQ worker; may not query directly |
| `sequence/helper.ts` | sequence, contact, step, stats, tracking, event | `resetSequence` wipes a sequence's data — multiple `deleteMany` calls. Add extension methods OR inline raw Prisma here (it's a one-off wipe, not reusable). |
| `email/processor.ts` | **hard-assigns** `this.emailTracking = new Prisma…()` + `this.emailEvent = …` in constructor body; also imports step/sequence/thread/template/contact Prisma repos | Replace hard-assignments with `this.db = db` (injected). Swap query calls to extension methods. |
| `contact/processor.ts` | (check) | |
| `schedule/processor.ts` | delegates to `runScheduleService` (converted in sub-plan 1) | Likely just needs the service dep; may have no direct repo usage. |
| `list/processor.ts` | listSyncRecord | Constructor-inject `db`; use `db.listSyncRecord.X()`. |
| `list/helper.ts` | (check) | |

**Pattern:** each processor gets `db: Db`. The processor's job is BullMQ glue —
keep it thin; domain logic lives in services.

**`sequence/helper.ts` decision:** `resetSequence` does a sequence of
`prisma.X.deleteMany(...)` calls across 5 tables. This is a one-off
orchestration, not a reusable per-model method. **Recommendation: inline raw
Prisma here** (it already imports `prisma` directly) rather than adding 5
single-use extension methods. The helper can take `db: Db` as a param if you
want testability, but it's fine to leave it on the singleton.

### Watch (`services/watch/`)

| File | Repos today | Notes |
|---|---|---|
| `index.ts` | mailbox, emailWatch | Add extension methods for mailbox + emailWatch queries; `WatchService` takes `db: Db`. |
| `cleanup.ts` | (check — covered by `watch-cleanup.service.test.ts`) | |

### Monitor (`services/monitor/`)

| File | Repos today | Notes |
|---|---|---|
| `service.ts` | sequenceStats (already imports `prisma` directly too) | Mostly uses `prisma` directly; formalize as `db: Db`. May add `sequenceStats` extension methods if the queries are reusable. |

### Controllers

| File | Repos today | Notes |
|---|---|---|
| `mailbox.controller.ts` | mailbox (via `watchService` + direct) | Take `db: Db` (or delegate to `WatchService` which now takes `db`). |
| `list.controller.ts` | listSyncRecord | Take `db: Db`; use `db.listSyncRecord.X()`. |

*(sequence, health, metrics controllers don't query the DB directly — they
delegate to services already converted in sub-plans 0/1. No change.)*

### Lib helpers (stateless functions)

| File | Repos as params today | Call sites to update |
|---|---|---|
| `lib/email-subject.ts` | emailThread, emailTracking, template | `services/jobs/email/processor.ts` — pass `this.db` |
| `lib/mailbox/index.ts` | mailbox | processors, services |
| `lib/stats/index.ts` | (uses `prisma` directly already; `$transaction`) | Leave on singleton OR thread `db` as param — your call. Recommendation: leave as-is. |
| `lib/schedule/index.ts` | (check — `ScheduleGenerator` is pure; may have a DB-touching fn) | |

**For lib helpers:** add `db: Db` as the first param where they query. Update
all call sites to pass `this.db` / `prisma`.

## Adding extension methods for this sub-plan

Models that need new extension methods here:
- `mailbox` — for watch service, mailbox controller
- `emailWatch` — for watch service
- `sequenceStats` — for monitor (if queries are reusable)
- `listSyncRecord` — for list controller/processor
- `sequenceStep`, `sequenceContact` — possibly for processors (check if already added in sub-plan 1)
- `emailThread`, `emailTracking`, `template`, `contact` — for email-subject lib helper + email processor

Follow the [mechanics in plan.md §4](./plan.md#4-the-mechanics-apply-to-every-repo-method):
copy the repo body verbatim, replace `prisma.X` with `Prisma.getExtensionContext(this)`.

## Tests

- **Processor unit tests** (`__tests__/unit/processors/`): if they fake repos,
  move to integration. If they only fake JobManager/queues, they may stay.
- **Lib helper unit tests** (`__tests__/unit/lib/`): the pure ones (pixel,
  placeholders, schedule-generator, email-subject-with-injected-repos) — check
  each. Pure helpers stay; DB-touching ones move.
- **Controller tests** (`__tests__/unit/controllers/`): if they fake repos, move.

**Don't move blanketly.** Check each test file: does it construct `FakeXRepository`?
→ move to integration. Does it only mock pure functions / JobManager? → stays.

## Files touched (indicative — verify each)

- `packages/database/src/domain-extension.ts` — add methods for mailbox, emailWatch, sequenceStats, listSyncRecord, etc.
- `packages/types/src/*.ts` — add any new record types
- `apps/mailops/src/services/jobs/{sequence,email,contact,schedule,list}/processor.ts` + `helper.ts` — convert
- `apps/mailops/src/services/watch/{index,cleanup}.ts` — convert
- `apps/mailops/src/services/monitor/service.ts` — convert
- `apps/mailops/src/controllers/{mailbox,list}.controller.ts` — convert
- `apps/mailops/src/lib/{email-subject,mailbox/index}.ts` — convert (db as param)
- `apps/mailops/src/composition-root.ts` — wire all the above with `prisma`
- Affected unit tests → move to integration (per-file check)

## Definition of done

- [ ] All processors take `db: Db` (or delegate to a converted service).
- [ ] `email/processor.ts` hard-assignments removed; uses injected `db`.
- [ ] Watch + monitor services use `db`.
- [ ] Mailbox + list controllers use `db`.
- [ ] Lib helpers take `db` as param where they query (email-subject, mailbox).
- [ ] `lib/stats` decision documented (leave on singleton OR convert).
- [ ] Extension methods added for all models touched here; packages rebuilt.
- [ ] Repo-faking unit tests moved to integration; pure tests stay.
- [ ] Composition root wires everything with `prisma`.
- [ ] `npm run typecheck -w mailops` clean.
- [ ] `npm run test -w mailops` green.
- [ ] `npm run test:integration -w mailops` green.
- [ ] **At this point, no production code should reference `@/repositories/`** — verify: `grep -r "@/repositories" apps/mailops/src/ --include="*.ts" | grep -v __tests__` returns nothing.
- [ ] [STATUS.md](./STATUS.md) jobs/watch/monitor/controllers/lib rows → ✅.
