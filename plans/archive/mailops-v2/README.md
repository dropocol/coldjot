# Mailops v2 — Remove the Repository Layer (Prisma Extension Approach)

> **Standalone refactor plan on branch `refactor/mailops-v2`.** Deletes the
> hand-written repository abstraction and replaces it with **Prisma client
> extension methods** — reusable, named data-access functions attached directly
> to Prisma models (`db.sequence.resetToDraft(id)`), defined once in
> `packages/database`.
>
> Supersedes and replaces `plans/repo-collapse/` (deleted).

## Read this first

- **[`plan.md`](./plan.md)** — the full analysis, end state, and step-by-step
  sub-plans.
- **[`STATUS.md`](./STATUS.md)** — the progress tracker you update as you go.

## TL;DR

The repository layer was a hand-written abstraction on top of Prisma — an
interface + an impl per concept, two files per repo, ~72 import sites. It's
gone. In its place: **a Prisma `$extends({ model })` extension** in
`packages/database/src/domain-extension.ts` that adds named, reusable methods
directly to Prisma models.

```ts
// before — find the query across 2 files in 2 directories
await this.sequenceRepo.resetToDraft(sequenceId);

// after — the method lives on the db client, defined once, reusable everywhere
await this.db.sequence.resetToDraft(sequenceId);
await this.db.sequence.findForLaunch(sequenceId, userId, ["completed", "opted_out"]);
await this.db.businessHours.createForSequence(userId, sequenceId, defaults);
```

The method is defined once in `packages/database`, composed onto the Prisma
client alongside the existing token-encryption extension, and every consumer
calls it through the injected `db` client. IDE autocomplete works. Methods are
reusable across services. No repo files, no separate interfaces.

## What you get

- **~65 files deleted.** All 36 repo files, all ~10 test fakes, all 18 repo
  tests, the fakes barrel, the seed helpers.
- **Reusable, discoverable methods.** `db.sequence.resetToDraft(id)` is defined
  once and usable anywhere `db` is available. IDE autocomplete on
  `db.sequence.` shows every method.
- **One dependency per service.** Constructors drop from 4–8 repo deps to a
  single `db: Db`.
- **Queries live with their model.** All sequence queries are in one place
  (the `sequence` block of the extension); all business-hours queries in
  another. Not scattered across services.

## What you give up

- **Fast domain-service unit tests via mocked repos.** Extension methods live
  on the Prisma client, which can't be cleanly mocked per-method. DB-touching
  code goes through the integration tier (real Postgres — already running).
  Pure-helper unit tests (46 of them) are unaffected.
- **A clean DB-swap seam.** If you ever replace Prisma, you'd port the
  extension methods to the new client's API. You've said this isn't on the
  table.

## How this plan is structured

| # | Scope | What |
|---|---|---|
| **0** ✅ | Foundation + launch-sequence slice | Export `Db`; create `domainExtension`; convert 1 service + tests end-to-end as the pattern proof |
| **1** | Remaining domain services | inbox-sync, run-schedule, send-email, tracking — add their methods to the extension |
| **2** | Jobs, watch, monitor, controllers, lib | Convert remaining consumers; add their methods to the extension |
| **3** | Delete the repository layer | Remove `repositories/`, repo tests, fakes; move remaining record types to `@coldjot/types` |
| **4** | Verify + commit | Full gate; confirm no repo imports remain |

Each sub-plan ends green. Sub-plan 0 is done and validated.

## The mechanics (for adding a new method to the extension)

When converting a repo method to an extension method:

1. Open `packages/database/src/domain-extension.ts`.
2. Find (or create) the `model.X` block for the Prisma model.
3. Add the method, using `Prisma.getExtensionContext(this)` to get the typed
   Prisma delegate:
   ```ts
   async myMethod(this: unknown, id: string): Promise<MyType | null> {
     const ctx = Prisma.getExtensionContext(this);
     const row = await ctx.findUnique({ where: { id } });
     return row as unknown as MyType | null;
   }
   ```
4. Move any record types the method returns into `@coldjot/types`.
5. Rebuild `@coldjot/database`: `npm run build -w @coldjot/types && npm run build -w @coldjot/database`.
6. In the consumer, replace `this.xRepo.method(...)` with `this.db.x.method(...)`.

## Branch

```
refactor/mailops          ← base (Phase 7 complete; the version you keep accessible)
  └─ refactor/mailops-v2  ← this work (created off refactor/mailops HEAD)
```

`refactor/mailops` stays untouched, so you can always go back.
