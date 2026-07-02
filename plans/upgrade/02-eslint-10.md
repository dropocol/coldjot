# Step 2 — `upgrade/eslint-10` (both apps + packages)

> Branch: `upgrade/eslint-10` off the merged `upgrade/zod-4`.
> Bump eslint 8 → **10.6.0** (latest). Flat config (`eslint.config.js`) is mandatory — ESLint 9+ dropped `.eslintrc*` support.

## Goal
Single modern flat-config ESLint setup across the monorepo.

## Bumps
- `apps/web/package.json`: `eslint` `^8` → `^10`; `eslint-config-next` `^15.1.6` → `^16` (matches the Step 5 Next upgrade; here we stay on Next 15, so `eslint-config-next@15.x` is also fine — pick the latest 15.x to stay consistent until Step 5).
- `apps/mailops/package.json`: `eslint` `^8.49.0` → `^10`; **add** `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin` (currently absent — the existing config comment explicitly notes TS parsing isn't wired).
- `packages/types/package.json`: `eslint` `^8.54.0` → `^10`.
- `packages/database/package.json`: **add** `eslint` `^10` devDep (has a `lint` script but declares no eslint dep today).

## Config migration (the bulk of the work)

### `apps/mailops` (only real `.eslintrc.json` today)
The existing `apps/mailops/.eslintrc.json`:
- Uses legacy `env`/`parserOptions`/`ignorePatterns` keys (no flat-config equivalent).
- Contains `//` line comments inside a `.json` file (JSON-illegal; only parses due to a JSONC-tolerant reader).
- Has a minimal ruleset: `no-extra-semi`, `no-cond-assign`, `no-constant-condition`, `no-debugger`, `no-dupe-keys`, `no-unreachable`, `use-isnan`, `valid-typeof`, `no-empty` (with `allowEmptyCatch`).

→ Convert to `apps/mailops/eslint.config.js` (flat array form):
- `languageOptions`: `ecmaVersion: 2023`, `sourceType: "module"`, `parser: tsParser`.
- `ignores`: `["dist", "node_modules", "**/*.js", "**/*.cjs"]`.
- `plugins: { "@typescript-eslint": tseslint }`.
- `rules`: port the existing ruleset verbatim (intentionally minimal — **do not** add new strict rules here; that's Plan 08's job, phased to `warn` then `error`).
- Delete `apps/mailops/.eslintrc.json`.

### `apps/web` (relies on `next lint` + `eslint-config-next`)
- `next lint` is **deprecated in 15.5+ and removed in 16**. On this step we're still on Next 15, so `next lint` still runs — but we make the config flat-config-compatible now so Step 5 (Next 16) is a no-op for linting.
- Create `apps/web/eslint.config.js` using Next's official flat-config path: `FlatCompat` wrapping `next/core-web-vitals`. This is the documented migration route.
- Keep the `"lint": "next lint"` script for now (Step 5 changes it to `eslint .`).

### `packages/types` (no existing config file)
- Create `packages/types/eslint.config.js` (net-new flat config): `tsParser` + `@typescript-eslint/recommended` + `no-unused-vars` with `argsIgnorePattern: "^_"`.

### `packages/database` (lint script, no eslint dep)
- Add `eslint` `^10` devDep + `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin`.
- Create `packages/database/eslint.config.js` (flat config).

### Root
- Ensure `turbo run lint` still orchestrates all four package lint scripts.
- Verify `turbo.json` `lint` task inputs/outputs still make sense.

## Verification
1. `npm install` succeeds.
2. `npm run lint` in **each** package passes: `apps/web`, `apps/mailops`, `packages/types`, `packages/database`.
3. `npm run lint` at root (turbo) passes.
4. `npm run build` still succeeds (lint shouldn't affect build, but eslint-config-next can pull in `parserOptions.project` that affect TS — verify).
5. No behavior change to app logic.

## Risks & rollback
- **`eslint-config-next` flat-config compat** has historically been finicky. If `FlatCompat` wrapping fails, fall back to running `next lint` with the legacy config and **defer** the web flat-config migration to Step 5 (where `next lint` is removed anyway and we're forced to it).
- **New TS-aware lint warnings** in mailops: the current config tolerates TS syntax but doesn't lint it. Adding `@typescript-eslint` may surface many `no-explicit-any`/`no-unused-vars` warnings. The plan is to keep rules minimal (port the existing ruleset); don't enable `recommended` in mailops if it floods warnings — phase it in later (Plan 08).
- Rollback: revert the commit; restore `.eslintrc.json` from git history; `npm install`.
