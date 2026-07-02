# Upgrade Status — ColdJot Dependency Modernization

> **Last updated:** Step 2 complete. **Resume from Step 3 (Tailwind 4).**
> Base branch: `refactor/old-code-update`. Plan: `plans/upgrade/`.

## How to resume

1. Use Node 24: `nvm use 24.18.0` (or `nvm install 24.18.0` once — `.nvmrc` pins it).
2. You are on branch `upgrade/eslint-10`. The next step starts a **new branch off this one**.
3. Read `plans/upgrade/README.md` for the full plan, then the specific step doc (e.g. `03-tailwind-4.md`).
4. Each step's verification bar: `tsc --noEmit` + build + `eslint .` for the affected packages, plus runtime smoke when env is available.

## Verification commands (Node 24)

```bash
source ~/.nvm/nvm.sh && nvm use 24.18.0

# Typecheck all packages
(cd packages/types && npx tsc --noEmit)
(cd packages/database && npx tsc --noEmit)
(cd apps/mailops && npx tsc --noEmit)
(cd apps/web && npx tsc --noEmit)

# Build packages (root `npm run build` has a pre-existing broken script —
# `turbo run build:development` references a task named `build:dev`. Build directly:)
(cd packages/types && npm run build)
(cd packages/database && npm run build)
(cd apps/mailops && npm run build)
(cd apps/web && APP_ENV=development npx next build)   # needs MAILOPS_SERVICE_TOKEN in env

# Lint each package
(cd apps/mailops && npx eslint "src/**/*.ts")
(cd apps/web && npx eslint .)
(cd packages/types && npx eslint "src/**/*.ts*")
(cd packages/database && npx eslint .)
```

## Branch chain (each builds on the previous)

| Branch | Step | Status | Commit |
|---|---|---|---|
| `chore/align-foundation` | 0 — Node 24, TS 6, dead-deps, tsconfig | ✅ done | `b761b78` |
| `upgrade/zod-4` | 1 — zod 3→4 | ✅ done | `4b2700b` |
| `upgrade/eslint-10` | 2 — eslint 8→10 flat config | ✅ done | `a97b058` |
| `upgrade/tailwind-4` | 3 — tailwind 3→4 (apps/web) | ⬜ **next** | — |
| `upgrade/express-5` | 4 — express 4→5 (apps/mailops) | ⬜ pending | — |
| `upgrade/next-16` | 5 — next 15→16 (apps/web) | ⬜ pending | — |
| `upgrade/prisma-7` | 6 — prisma 6→7 | ⬜ pending | — |
| `upgrade/smtp-ai-minors` | 7 — googleapis/pino/date-fns align + minors | ⬜ pending | — |

## What's been upgraded so far

| Package | Was | Now |
|---|---|---|
| Node floor | `>=20` | `>=24` (`.nvmrc` → 24) |
| `typescript` | 5.x | **6.0.3** |
| `@types/node` | 20.x | **24.x** |
| `zod` | 3.24 | **4.4.3** |
| `@hookform/resolvers` | 3.10 | latest (zod-4 compatible) |
| `eslint` | 8.x | **10.x** (flat config) |

## Code changes made (not just deps)

- **Step 0:**
  - `tsconfig.json` (root + all packages): `target es2017→es2023`, `moduleResolution "node"→"bundler"` (deprecated in TS 6), dropped deprecated `baseUrl` (mailops), added `types:["node"]` (types, database).
  - `apps/web/src/types/css.d.ts`: ambient `*.css` declaration (TS 6 stricter side-effect import check).
  - `apps/mailops/src/lib/log/index.ts`: `Error.prepareStackTrace` now non-optional in `@types/node@24` → save/restore original instead of resetting to `undefined`.
  - Removed dead deps: `bull` (web), `bull`+`@types/bull`+`date-fns-tz`+`@bull-board/api` (mailops) — all verified 0 imports.
- **Step 1:** `ZodType` 3-param→2-param (`validation.ts`), `z.record(z.string())`→2-arg (`pubsub.ts`), `z.string().email()`→`z.email()` (3 files).
- **Step 2:** flat configs for all 4 packages; deleted `apps/mailops/.eslintrc.json`; wired `@typescript-eslint` parser in mailops (killed 67 pre-existing parse errors).

## Known issues / carryover (NOT regressions)

- **Root `npm run build` is broken (pre-existing on master):** script runs `turbo run build:development` but the task is named `build:dev`. Build each app directly (see commands above). Fix is out of scope for the upgrade.
- **`next build` for web needs `MAILOPS_SERVICE_TOKEN`** set in `apps/web/env/.env.development` (the zod env schema crashes at page-data collection without it — designed behavior per HANDOFF §1). Also needs the matching `SERVICE_INTERNAL_TOKEN` in mailops. **You must set these to run either app.** Generate with `openssl rand -hex 32`.
- **mailops `env/` directory doesn't exist** — needs `env/.env` + `env/.env.development` with `DATABASE_URL`, `REDIS_HOST`, `SERVICE_INTERNAL_TOKEN`, etc. Setting up the full dev env is your operational task (see HANDOFF).
- **Web lint: 441 warnings** — all pre-existing code-quality (`no-explicit-any`, `prefer-const`, etc.), intentionally downgraded to `warn` so the version bump stays clean. Plan 08 phases them to error.
- **13 old stashes** exist on various branches — unrelated to this work, left untouched.
- **`npm approve-scripts`** may be needed after fresh installs for prisma/esbuild native build scripts.

## Next step detail (Step 3 — Tailwind 4)

See `plans/upgrade/03-tailwind-4.md`. Summary:
- Branch: `git checkout -b upgrade/tailwind-4` (off `upgrade/eslint-10`).
- Bump `tailwindcss 3.4→4`, add `@tailwindcss/postcss`, bump `tailwind-merge→3`.
- Run `npx @tailwindcss/upgrade` codemod first, then hand-fix.
- `postcss.config.mjs`: `tailwindcss` → `@tailwindcss/postcss`.
- `globals.css`: `@tailwind base/components/utilities` → `@import "tailwindcss"`; add `@custom-variant dark` for class strategy; migrate theme to `@theme`.
- **Critical:** preserve the shadcn `hsl(var(--…))` token theme exactly.
- Verify: `next build` compiles CSS; visual smoke in light + dark mode.
