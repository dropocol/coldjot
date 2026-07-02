# Step 6 — `upgrade/prisma-7` (packages/database + consumers)

> Branch: `upgrade/prisma-7` off the merged `upgrade/next-16`.
> Bump prisma / `@prisma/client` 6.2 → **7.8.0** (latest). Isolated to the database package + its consumers.

## Goal
Move the Prisma layer to v7 and regenerate the client. The DB schema (Prisma 6 → 7) is generally backward-compatible at the **query language** level; the risk is in the client regen + any renamed model APIs.

## Bumps
- `packages/database/package.json`: `prisma` `^6.2.1` → `^7.8.0`; `@prisma/client` `^6.2.1` → `^7.8.0`.
- Verify consumers (`apps/web`, `apps/mailops`) pick up the new `@prisma/client` via the workspace `*` dep — they import through `@coldjot/database`, so no direct version pin needed unless they re-export client types.

## Changes

### 1. Read the Prisma 6 → 7 upgrade guide
At exec time, check `prisma.io/docs/orm/migration-notes` for the 7.0 migration notes. Known v7 themes (verify):
- Drops support for very old Node versions (we're on 24, fine).
- Possible changes to the generated client location / `previewFeatures` defaults.
- TypeScript type tightening on `where` inputs.

### 2. Regenerate the client
```bash
cd packages/database
dotenv -e env/.env.development -- prisma generate
```
Commit the regenerated `node_modules/.prisma/client` artifacts (or however the repo vendors the client — check `.gitignore`).

### 3. Migrate the schema (no destructive changes)
- Run `prisma migrate dev --create-only` to generate a diff migration for any v7 schema syntax changes.
- **Do not** run destructive migrations (Plan 02b/06 from the original refactor remain in HANDOFF's blocked list).
- If v7 introduces new required schema attributes (e.g. explicit `@map` for relations), apply them in a non-destructive migration.

### 4. Audit consumer code for renamed/breaking APIs
Grep consumers (`apps/web/src`, `apps/mailops/src`) for:
- `prisma.$transaction(...)` — verify signature unchanged in v7.
- `prisma.$queryRaw` / `$executeRaw` — verify.
- Any `@prisma/client` type imports (`Prisma`, `PrismaClient`, model types) — verify they still export.
- `findUnique` / `findMany` / `create` / `update` `select`/`include` shapes — verify no type errors.

## Verification
1. `npm install` succeeds.
2. `cd packages/database && prisma generate` succeeds.
3. `tsc --noEmit` passes in `packages/database`, `apps/web`, `apps/mailops` (all consume the client).
4. `npm run build` succeeds for both apps.
5. `npm run lint` passes.
6. **Runtime smoke (DB-touching):**
   - Boot both apps with a live DB connection.
   - Web: log in (Session query), load dashboard (multiple `findMany`), create/edit a contact, open a sequence.
   - Mailops: trigger a sequence launch (writes to `EmailEvent`), verify the PubSub path still reads/writes `Mailbox`.
   - Watch for any Prisma runtime deprecation warnings in logs.

## Risks & rollback
- **Client regen artifacts** must be committed correctly — if `node_modules/.prisma` is gitignored, consumers must run `prisma generate` post-install. Verify the repo's setup.
- **Schema syntax changes** could require a migration — keep it non-destructive.
- **Type tightening** in v7 may surface new `tsc` errors in consumer `where` clauses — fix as they appear.
- Rollback: revert the commit; restore prisma 6; regenerate the client. If a migration was applied, `prisma migrate resolve --rolled-back` it.
- **DB-migration safety:** this step generates migrations but the destructive ones (Plan 02b/06) remain deferred. If any v7 migration looks destructive, **stop and flag** — don't run it blind.
