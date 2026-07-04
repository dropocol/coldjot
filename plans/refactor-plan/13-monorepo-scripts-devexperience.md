# Plan 13 — Monorepo Scripts, Turbo & Dev-Experience Cleanup

> **Audience:** an implementing model/engineer. Self-contained; no dependency on other plans.
>
> **Audit scope:** the build/run script layer across the whole monorepo — root `package.json`, `apps/web`, `apps/mailops`, `packages/types`, `packages/database`, all five `turbo.json` files, `docker-compose.yml`, env loading.
> **Goal:** one consistent command surface, a correctly-wired Turbo that actually caches and respects the task graph, the ability to run web + mailops together in one command, and no dead/duplicated tooling.

---

## Problem

The script layer has grown into a tangled, partly-broken surface. Concretely:

### 1. The root `dev` / `start` / `build` commands are broken or wasteful
- Root `"dev": "turbo run dev"` — **works**, but `turbo run dev` runs **every** package's `dev` task, including the two `packages/*` `dev` tasks (`tsup --watch`). For day-to-day work you almost always want only `web` + `mailops`. There is no `turbo run dev --filter=web --filter=mailops` shortcut, and no `dev:apps` alias.
- Root `"start": "turbo run start:dev"` — **broken**. No package defines a `start:dev` script (`apps/web` has `start` + `start:prod`; `apps/mailops` has `start` + `start:prod`). `turbo run start:dev` finds zero tasks → no-op. Confirmed by script dump.
- Root `"build": "turbo run build:development && turbo run db:deploy --filter=@coldjot/database"` — **broken**. No package defines `build:development` (they define `build`, `build:dev`, `build:prod`). `turbo run build:development` is a silent no-op; only the `db:deploy` half runs. The verification commands in `STATUS.md` already call this out ("a separate turbo-config gap").
- Root `"web#build:prod"` — invalid npm script name (`#` is fine in JSON but `npm run web#build:prod` is awkward and it's redundant with `turbo run build:prod --filter=web`).

### 2. Three different "run both apps" paths exist, none first-class
The user currently has to choose between: `turbo run dev` (also starts package watchers), `npm run dev:with-services` (docker + the above), or running two terminals by hand. There is **no** `dev:web` / `dev:mailops` / `dev:apps` trio.

### 3. Turbo is mis-configured (caching & env are half-wired)
- **Inconsistent env declaration across `turbo.json` files.** The root `turbo.json` declares `globalPassThroughEnv` for `LOG_LEVEL, APP_ENV, NODE_ENV, DATABASE_URL` — but each app's own `turbo.json` then **re-lists** overlapping vars per-task (`DATABASE_URL`, `APP_ENV`…) and they drift. `globalPassThroughEnv` means those vars intentionally bust the cache, which is correct for `DATABASE_URL` only at build time, not for `dev` (which is `cache:false` anyway).
- **`build:dev` is over-cached.** `apps/mailops/turbo.json` sets `build:dev` `cache:true`, but `packages/types/turbo.json` and `packages/database/turbo.json` set `build:dev` `cache:false`. Same monorepo, opposite policies for the same logical task → cache misses whenever the dev build runs.
- **`start:prod` is cached** in `apps/mailops/turbo.json` (`cache:true`). Running a server is a long-lived process; caching it is meaningless and produces confusing "CACHE HIT" output for a task that never completes.
- **`db:deploy` is a build-time dependency of `build`.** `packages/database/turbo.json` makes `build:dev` `dependsOn: ["db:deploy", "db:generate"]`. That means **every** `turbo run build` runs a database migration. Migrations must be a deliberate, explicit operator action — never an automatic side-effect of `build` (this is a footgun the security plans explicitly avoid).
- **Root `turbo.json` has a stale `start:dev` task** (`cache:false`) for a script that no package defines.

### 4. Dependency declarations are messy (dead + duplicated + misplaced)
Verified-unused / misplaced deps found in the script/`package.json` audit:

**`apps/mailops` — frontend deps that leaked into the backend** (zero source imports):
- `react-day-picker`, `react-intersection-observer`, `@hookform/resolvers` — React libs with **no** imports anywhere in `apps/mailops/src`. (Mailops is an Express/BullMQ backend; it has no React.)
- `nodemon` + the `nodemon.json` file + the `dev-2` / `dev:debug-2` scripts — superseded by `tsx watch` (the active `dev` script). `dev-2`/`dev:debug-2` rebuild-then-restart via nodemon; `tsx watch` is faster and is what `dev` already uses.
- `ts-node` is **not** in mailops (good), but `tsx` is pinned at `^4.7.0` while web has `^4.19.2` — drift.

**`apps/web` — dead/misplaced:**
- `concurrently` — listed in `dependencies` but **not used** by any script or source file (web runs a single Next process; Turbo handles concurrency at the monorepo level).
- `axios` — still in `dependencies` but **zero imports** after plan 07 (everything now goes through the typed `api-client` + react-query).
- `jest`, `sinon`, `@types/jest`, `@types/sinon` — present in `dependencies` but web has **no tests yet** (testing baseline is blocked — see [`../testing/01-testing-baseline.md`](../testing/01-testing-baseline.md)). These belong in `devDependencies` and only once tests exist; for now they're dead weight in the prod install.
- `@eslint/eslintrc`, `@eslint/js`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `eslint-plugin-react-hooks`, `typescript-eslint` — **all in `dependencies`**, should be `devDependencies`. (Lint config is dev-only.)
- `fs-extra` + `@types/fs-extra` — verify usage; if only used by a one-off script, move to `devDependencies`.
- Stale duplicate ESLint config: `apps/web/.eslintrc.json` (legacy, all rules `off`) **and** `apps/web/eslint.config.js` (flat config, the real one). The `.eslintrc.json` is dead — ESLint 10 with a flat config present ignores it, but it's confusing and should be deleted.

**Cross-package version drift** (same package, different ranges):
- `tsx`: mailops `^4.7.0` vs web `^4.19.2`.
- `rimraf`: mailops/types/web `^6` vs database `^5.0.5`.
- `tsup`: types/mailops `^8.0.1` vs database `^8.5.1`.
- `dotenv-cli`: root `^7.4.4` (devDep) vs database `^11.0.0` (devDep).
- `@types/node`, `typescript` — consistent (`^26`, `^6.0.3`) ✓.

### 5. Env loading is inconsistent across apps
- **mailops** loads env in TS at runtime (`apps/mailops/src/config/env.ts` → `dotenv.config({ path: process.cwd()/env/.env* })`, then zod-parse). Robust and self-contained.
- **web** loads env **inside `next.config.ts`** via a hand-rolled `dotenv.config` + `existsSync` ladder, plus a separate `apps/web/src/env.ts` zod schema. Two different code paths touch env; `next.config.ts` even `console.log`s the resolved path on every build.
- **database** loads env via `dotenv-cli` wrappers in scripts (`dotenv -e env/.env.development -- prisma …`) — a third mechanism.
- The root `db:migrate` / `db:push` / `db:reset` scripts use `dotenv -e .env` (relative to **root**, where no `.env` exists) — these are **broken** and shadow the working per-package `db:*` scripts in `packages/database`.

### 6. Naming inconsistency
- typecheck script: `apps/mailops` → `typecheck`; `packages/types` + `packages/database` → `type-check`. Root has no `typecheck` aggregate at all (the `STATUS.md` verification block runs `tsc --noEmit` by hand in 4 directories).

---

## Goal (end state)

1. **One command surface.** From the repo root you can run:
   - `npm run dev` → web + mailops only (the 99% case).
   - `npm run dev:apps` → same, explicit alias.
   - `npm run dev:all` → web + mailops + the two package watchers (current `turbo run dev` behavior), for when you're iterating on `@coldjot/types`/`@coldjot/database`.
   - `npm run build` → builds every package via the **correct** task name, with proper caching. No DB migration side-effect.
   - `npm run typecheck` / `npm run lint` / `npm run clean` → run across all packages through Turbo.
2. **No broken scripts.** Every root script maps to a task that ≥1 package actually defines.
3. **Turbo wired correctly:** consistent env vars, sensible cache policy (cache `build`/`build:prod`, never cache `dev`/`start`/`db:*`), `db:deploy` **not** a build dependency.
4. **Dead deps removed, misplaced deps moved to `devDependencies`, version drift harmonized** to the higher range.
5. **Env loading unified:** mailops-style runtime zod validation in web too (delete the `next.config.ts` dotenv ladder); one canonical `env.ts` per app. Root `db:*` scripts delegate to `packages/database`.
6. **mailops + web run together in one command** with clean interleaved logs.

---

## Implementation steps

Work in this order; each step is independently committable. **Do not change dependency versions in the same commit as script edits** — keep dep moves separate so a bisect stays meaningful.

### Step 1 — Fix the root scripts (the broken commands)

Edit root `package.json` `scripts`:

```jsonc
{
  "scripts": {
    // ── Dev ──────────────────────────────────────────────────────────────
    // Default: just the two apps (the 99% case). Watchers for the shared
    // packages are not needed — they're consumed as built dist unless you're
    // actively editing them.
    "dev": "turbo run dev --filter=web --filter=mailops",
    "dev:apps": "turbo run dev --filter=web --filter=mailops",
    "dev:all": "turbo run dev",

    // ── Services (docker) ────────────────────────────────────────────────
    "services:up": "docker compose up -d",
    "services:down": "docker compose down",
    "services:logs": "docker compose logs -f",
    "redis:up": "docker compose up -d redis",
    "redis:down": "docker compose down",
    "redis:logs": "docker compose logs -f redis",
    "db:up": "docker compose up -d postgres",
    "db:down": "docker compose down",
    "db:logs": "docker compose logs -f postgres",

    // Dev with infra: bring up redis+postgres, then run the apps.
    "dev:with-services": "npm run services:up && npm run dev",
    "dev:with-redis": "npm run redis:up && npm run dev",

    // ── Build / start ────────────────────────────────────────────────────
    // Build every workspace via the canonical task name. db:deploy is NOT a
    // build dependency — migrations are explicit (see db:deploy below).
    "build": "turbo run build",
    "build:prod": "turbo run build:prod",
    "start": "turbo run start",
    "start:prod": "turbo run start:prod",

    // ── Database (delegate to packages/database) ────────────────────────
    "db:generate": "turbo run db:generate --filter=@coldjot/database",
    "db:deploy": "turbo run db:deploy --filter=@coldjot/database",
    "db:deploy:prod": "turbo run db:deploy:prod --filter=@coldjot/database",
    "db:migrate": "npm run db:migrate -w @coldjot/database",
    "db:push": "npm run db:push -w @coldjot/database",
    "db:reset": "npm run db:reset -w @coldjot/database",
    "db:studio": "npm run db:studio -w @coldjot/database",
    "db:seed": "npm run db:seed -w @coldjot/database",

    // ── Quality ─────────────────────────────────────────────────────────
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "format": "prettier --write \"**/*.{ts,tsx,md}\"",
    "clean": "turbo run clean && rm -rf node_modules",

    // ── Debug helpers (kept; low-cost) ──────────────────────────────────
    "debug:env": "turbo run dev --dry=json --filter=web --filter=mailops"
  }
}
```

Notes:
- Delete `"web#build:prod"` (redundant; use `turbo run build:prod --filter=web` if ever needed).
- Delete `"check:env"` (a `node -e console.log(process.env)` one-liner that adds nothing over `printenv`).
- The root `db:migrate`/`db:push`/`db:reset` previously pointed at a nonexistent root `.env` via `dotenv -e .env`; delegating to the workspace uses the package's own correctly-wrapped script. **This is a real bug fix, not cosmetic.**

**Canonicalize the typecheck script name to `typecheck`** (no hyphen) in `packages/types/package.json` and `packages/database/package.json`:
```jsonc
"typecheck": "tsc --noEmit"   // rename from "type-check"
```
(`apps/mailops` already uses `typecheck`. `apps/web` needs the script **added** — see Step 4.)

### Step 2 — Fix the Turbo configs (caching + graph correctness)

**Root `turbo.json`** — replace entirely:
```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  // Env vars that, when changed, should bust the build cache across all tasks.
  "globalEnv": ["NODE_ENV", "APP_ENV"],
  // Secrets / runtime-only vars that must pass through WITHOUT being hashed
  // into cache keys (they vary per-machine and must not cause cache misses).
  "globalPassThroughEnv": ["DATABASE_URL"],
  "tasks": {
    "dev":        { "cache": false, "persistent": true },
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "build:prod": {
      "dependsOn": ["^build:prod"],
      "outputs": ["dist/**", ".next/**"]
    },
    "start":      { "cache": false, "persistent": true },
    "start:prod": { "cache": false, "persistent": true },
    "lint":       { "dependsOn": ["^build"] },
    "typecheck":  { "dependsOn": ["^build"] },
    "test":       { "dependsOn": ["^build"] },
    "clean":      { "cache": false }
  }
}
```

Key changes:
- Drop the dead `start:dev` and `build:development` tasks.
- `globalEnv` (vars that **should** affect cache key) vs `globalPassThroughEnv` (vars that **must not** be hashed) are now used correctly. Previously `DATABASE_URL` was in passthrough (correct) but `APP_ENV`/`NODE_ENV` were also in passthrough — they should be in `globalEnv` because they change build output (e.g. `APP_ENV=production` vs `development` produces a different Next build).
- `lint` and `typecheck` now `dependsOn: ["^build"]` so the shared packages are built before they're linted/typechecked (the `@coldjot/types` and `@coldjot/database` dist must exist for the apps to resolve them).
- `db:*` tasks are **deliberately not defined at the root** — they belong only to `@coldjot/database`.

**`apps/web/turbo.json`** — simplify (the per-task `env` arrays are no longer needed once root declares `globalEnv`; keep only what's web-specific):
```jsonc
{
  "extends": ["//"],
  "tasks": {
    "build":     { "env": ["NEXT_PUBLIC_*", "NEXTAUTH_*", "GOOGLE_*", "ENCRYPTION_KEY", "AUTH_TRUST_HOST"] },
    "build:prod":{ "env": ["NEXT_PUBLIC_*", "NEXTAUTH_*", "GOOGLE_*", "ENCRYPTION_KEY", "AUTH_TRUST_HOST"] }
  }
}
```
(`dependsOn` and `outputs` are inherited from root; remove the redundant `inputs: ["**/web/env/.env.*"]` blocks — env files are covered by the `env` array, and the glob was wrong anyway since turbo runs from each package's dir.)

**`apps/mailops/turbo.json`** — simplify to the same shape; remove `start:prod` `cache:true` and the phantom `start:prod:watch` task. Keep mailops-specific `env` vars (`PORT`, `REDIS_*`, `QUEUE_PREFIX`, `PUBSUB_*`, `SERVICE_INTERNAL_TOKEN`).

**`packages/types/turbo.json`** and **`packages/database/turbo.json`** — collapse to just the package-specific extras. Critically, in **`packages/database/turbo.json`**:
- Remove `build`'s `dependsOn: ["db:generate"]` → keep `db:generate` as a standalone task that `build` does **not** auto-run (generation should be explicit / part of install, not every build).
- **Remove `build:dev`'s `dependsOn: ["db:deploy", "db:generate"]`** — this is the migration-as-build-side-effect footgun. `db:deploy` becomes a task you run explicitly via `npm run db:deploy`.

### Step 3 — Remove dead deps, move misplaced deps, fix drift (separate commit)

**`apps/mailops/package.json`:**
- Remove from `dependencies`: `react-day-picker`, `react-intersection-observer`, `@hookform/resolvers` (no source imports — verified).
- Remove from `devDependencies`: `nodemon`; delete `apps/mailops/nodemon.json`.
- Remove scripts `dev-2`, `dev:debug-2` (nodemon-based, superseded by `dev`).
- Bump `tsx` `^4.7.0` → `^4.19.2` (match web).
- Bump `rimraf` `^6.1.3` (already latest) — keep.
- Move testing deps to `devDependencies` (they're currently in `dependencies`): `@types/jest`, `sinon`, `@types/sinon`. Keep `jest`/`@types/jest` if mailops has tests; if the testing baseline ([`../testing/01-testing-baseline.md`](../testing/01-testing-baseline.md)) hasn't added mailops tests yet, these can stay as devDeps ready for it.

**`apps/web/package.json`:**
- Remove from `dependencies`: `axios` (zero imports post-plan-07), `concurrently` (unused).
- Move from `dependencies` → `devDependencies`: `@eslint/eslintrc`, `@eslint/js`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `eslint-plugin-react-hooks`, `typescript-eslint`.
- Move `jest`, `sinon`, `@types/jest`, `@types/sinon` from `dependencies` → `devDependencies` (or remove entirely until the testing baseline ([`../testing/01-testing-baseline.md`](../testing/01-testing-baseline.md)) lands tests — your call; moving is the safe minimum).
- Verify `fs-extra` usage; if only used by a script, move to `devDependencies`.
- Delete `apps/web/.eslintrc.json` (dead legacy config; the flat `eslint.config.js` is authoritative under ESLint 10).

**`packages/database/package.json`:**
- Bump `rimraf` `^5.0.5` → `^6.1.3` (match the rest of the repo). Update `clean` script if it relied on rimraf v5 flags (it doesn't — `rm -rf` is used).

**`packages/types/package.json`:**
- Bump `tsup` `^8.0.1` → `^8.5.1` (match database).

**Root `package.json`:**
- Bump `dotenv-cli` `^7.4.4` → `^11.0.0` (match database) — or, once Step 5 lands and the root no longer needs `dotenv-cli` at all (db scripts delegate to the workspace), **remove it** from root devDeps.

After edits: `npm install --legacy-peer-deps --ignore-scripts && npm approve-scripts @prisma/client @prisma/engines prisma` (per existing `STATUS.md` install recipe), then `npx prisma generate`.

### Step 4 — Add the missing `typecheck` script to web; unify script shape

In `apps/web/package.json` `scripts`, add:
```jsonc
"typecheck": "tsc --noEmit"
```
(web currently has no typecheck script even though `STATUS.md` runs `tsc --noEmit` against it by hand.)

Standardize each package to expose the same core script set — `dev`, `build`, `build:prod`, `start`/`start:prod` (where applicable), `lint`, `typecheck`, `clean`. The packages already mostly conform once Step 1's rename lands; just fill gaps.

### Step 5 — Unify env loading (web → mailops pattern)

The goal: every app resolves its own env from its own `env/` dir at runtime via a zod-validated `env.ts`, with **no** build-time dotenv ladder in `next.config.ts`.

1. **`apps/web/src/env.ts`** — ensure it follows the mailops pattern: load `env/.env`, then `env/.env.${APP_ENV}`, then `env/.env.local`, then `env/.env.${APP_ENV}.local` (using `process.cwd()`), then zod-parse. (The file already exists with a zod schema; align its dotenv-loading to match `apps/mailops/src/config/env.ts` lines 1–11.)
2. **`apps/web/next.config.ts`** — delete the entire `dotenv`/`existsSync`/`console.log` ladder (lines 1–27). Import `./src/env` (or rely on it being imported early) so the zod validation runs once at config-eval time. The `nextConfig` object stays; just remove the env-loading preamble and the `dotenv` import. This removes the noisy `console.log("Loading env file: …")` on every build and the second env code path.
3. Confirm `apps/web/src/env.ts` is imported by something that Next evaluates during build (the existing `mailops.ts` + `queue-api-client.ts` imports already pull it in transitively; if not, add a top-of-`next.config.ts` `import "./src/env"` to guarantee boot-time validation).

> **Why this matters:** it eliminates the "two env systems" confusion (one in `next.config.ts`, one in `src/env.ts`), makes web fail-fast at boot on a missing required var (like mailops already does), and is the pattern the security plans (02/03) already assume.

### Step 6 — Verify the "run both apps" flow end to end

```bash
nvm use 24.18.0
npm install --legacy-peer-deps --ignore-scripts
npm approve-scripts @prisma/client @prisma/engines prisma
npx prisma generate --schema=packages/database/prisma/schema.prisma

# Single command, both apps, interleaved logs:
npm run services:up        # postgres + redis
npm run dev                # ← web (:3000) + mailops (:3001) via turbo

# In another terminal — confirm the new aggregates work:
npm run typecheck          # all four packages
npm run lint               # all four packages
npm run build              # builds everything; NO db migration side-effect
npm run db:deploy          # migrations are now explicit, not automatic
```

Confirm:
- `npm run dev` starts exactly **web + mailops** (not the package watchers).
- `npm run dev:all` also starts the two `packages/*` watchers.
- `npm run build` does **not** run a Prisma migration (check the log — previously it did, via `packages/database/turbo.json`'s `dependsOn`).
- `npm run db:migrate` from root works (previously it ran `dotenv -e .env` against a nonexistent root file).
- `turbo run build --dry=json` shows the dependency graph resolving `@coldjot/types` and `@coldjot/database` before `web`/`mailops`.

---

## Files to touch

**Edit:**
- `package.json` (root) — scripts (Step 1).
- `turbo.json` (root) — full rewrite (Step 2).
- `apps/web/turbo.json`, `apps/mailops/turbo.json`, `packages/types/turbo.json`, `packages/database/turbo.json` — simplify (Step 2).
- `apps/mailops/package.json` — dep removals/moves, script removals, `tsx` bump (Step 3).
- `apps/web/package.json` — dep removals/moves, add `typecheck` (Steps 3 + 4).
- `packages/database/package.json` — `rimraf` bump, `type-check`→`typecheck` rename (Steps 1 + 3).
- `packages/types/package.json` — `tsup` bump, `type-check`→`typecheck` rename (Steps 1 + 3).
- `apps/web/src/env.ts` — align dotenv loading to the mailops pattern (Step 5).
- `apps/web/next.config.ts` — remove the dotenv ladder (Step 5).

**Delete:**
- `apps/mailops/nodemon.json` (Step 3).
- `apps/web/.eslintrc.json` (Step 3 — dead legacy ESLint config).

**No code (runtime) changes required** — this is a scripts/config/deps plan. The only source touched is `next.config.ts` (env-loading removal) and `apps/web/src/env.ts` (alignment), both non-behavioral.

---

## Verification

1. **No broken scripts:** `npm run` (no args) lists every root script; spot-check that each maps to a real task: `npm run dev`, `npm run build`, `npm run start`, `npm run typecheck`, `npm run lint`, `npm run db:deploy` all execute without "missing script" / "no tasks matched" errors.
2. **Both-apps dev:** `npm run dev` shows web on `:3000` and mailops on `:3001` in one terminal with prefixed logs.
3. **No migration side-effect:** `npm run build` log contains **no** `prisma migrate` output.
4. **Cache correctness:** run `npm run build` twice — second run reports cache hits for the unchanged packages; change a `@coldjot/types` source file and confirm only `types` + its dependents rebuild.
5. **Env fail-fast:** delete `SERVICE_INTERNAL_TOKEN` from `apps/mailops/env/.env.development`, run `npm run dev` → mailops crashes at boot with the zod error (not a silent runtime NaN later). Restore it. Do the same for web's `MAILOPS_SERVICE_TOKEN`.
6. **Lint/typecheck aggregates:** `npm run lint` and `npm run typecheck` each report 0 errors across all four packages.
7. **Install size:** after dep removal, `npm install` produces a smaller `node_modules` (sanity-check `du -sh node_modules` before/after — expect a modest drop from axios/concurrently/nodemon/react-* removal in mailops).

---

## Risks & rollback

- **`db:deploy` no longer auto-runs on `build`.** If any deploy pipeline currently relied on `npm run build` to also migrate (the old broken `build:development` chain), it will silently stop migrating. **Mitigation:** the old chain was broken anyway (`build:development` was a no-op), so no real pipeline depended on it; but update any CI/CD to call `npm run db:deploy` explicitly. Rollback: re-add `dependsOn` in `packages/database/turbo.json`.
- **`globalEnv` change for `APP_ENV`/`NODE_ENV`.** Existing turbo cache entries become stale and will be rebuilt once. Harmless; expect a cold first build after this lands.
- **Removing `axios`/`react-day-picker` from mailops.** Verified zero imports, but if a dynamic/import-lazy reference exists that grep missed, it will crash at runtime. **Mitigation:** `npm run build` for mailops succeeds (tsup would fail on an unresolved import that's actually imported); plus the Step 6 smoke.
- **Web env-loading move.** If `next.config.ts` was the **only** place importing `dotenv` for web, and `src/env.ts` isn't transitively imported at build time, web could build without env loaded. **Mitigation:** Step 5 explicitly verifies the transitive import; add an explicit `import "./src/env"` in `next.config.ts` if needed.
- **Rollback:** every change is in scripts/config/deps — revert the commits and `npm install`. No data, no migrations, no runtime behavior change.
