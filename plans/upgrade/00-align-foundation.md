# Step 0 — `chore/align-foundation` (runway)

> Branch: `chore/align-foundation` off `refactor/old-code-update`.
> This is the foundation every other step builds on. Lowest risk; do first.

## Goal
- Raise Node floor to `>=24`.
- Bump TypeScript to 6.
- Remove confirmed-dead dependencies.
- Modernize `tsconfig` target.
- `npm update` to latest within current majors (safe patch/minor).
- Add `.nvmrc`.

## Changes

### 1. Node floor `>=20` → `>=24`
- Root `package.json`: `"engines": { "node": ">=24" }`
- Add `"engines": { "node": ">=24" }` to: `apps/web/package.json`, `apps/mailops/package.json`, `packages/types/package.json`, `packages/database/package.json`
- Create root `.nvmrc` → `24` (so `nvm use` / CI pins 24.x)
- Bump `@types/node` to `^24` in: root (if present), `apps/web`, `apps/mailops`, `packages/types`, `packages/database`

### 2. TypeScript `^5.x` → `^6.0.3`
- All five `package.json` files declare `typescript` (root via turbo, web `^5.6.3`, mailops `^5.2.2`, types `^5.3.2`, database `^5.3.3`). Bump every one to `^6`.
- **TS 6 is a relatively small major** (per TS team: mostly removal of long-deprecated options, tightened `lib` defaults). Verify `tsc --noEmit` passes in every package.
- The root `tsconfig.json` uses `moduleResolution: "node"` + `target: "es2017"` — both still valid in TS 6. (Target bumped in §4.)

### 3. Dead-dependency removal (verified unused — `rg from "(bull|date-fns-tz|@bull-board)"` returns 0 source matches)
- `apps/mailops/package.json`: remove `bull`, `@types/bull`, `date-fns-tz`, `@bull-board/api`
- `apps/web/package.json`: remove `bull` (web declares `bull@^4.12.0` — also unused)
- Root `package.json`: remove `i`, `npm` (already done in commit `b789f1e` per HANDOFF — verify they're gone; if present, remove)
- Run `npm install` to regenerate the lockfile after each removal.

### 4. tsconfig modernization (Plan 11 §9)
- Root `tsconfig.json`: `target: "es2017"` → `"es2023"`; keep `lib: ["dom","dom.iterable","esnext"]` (web needs DOM). Per-app tsconfigs override where needed — verify they still build.

### 5. `npm update` within current majors (safe patch/minor bumps)
Target the latest within each current major (do **not** cross a major here — that's steps 1–7):
- `next` → latest 15.x (don't go to 16 here)
- `react` / `react-dom` → latest 19.x
- `prisma` / `@prisma/client` → latest 6.x (don't go to 7 here)
- `bullmq` → latest 5.x
- `eslint` / `eslint-config-next` → latest 8.x / 15.x (don't cross here)
- `tailwindcss` → latest 3.4.x (don't cross here)
- `express` → latest 4.x (don't cross here)
- `zod` → latest 3.x (don't cross here)
- `tsup`, `turbo`, `tsx`, `@auth/prisma-adapter`, `@tanstack/react-query`, `framer-motion`, `@radix-ui/*`, `tailwind-merge`, `react-hook-form`, `recharts`, `next-auth`, `lucide-react`, `googleapis` (align both apps), `pino`/`pino-pretty` (align both apps) → latest within current majors
- `@lexical/*` (all 10) → latest 0.25.x
- `@tiptap/*` → latest 2.x (kept for now; consolidation is Plan 11)
- `luxon` / `@types/luxon` → latest 3.x

## Verification
1. `nvm use` → Node 24.x active.
2. `npm install` succeeds (lockfile regenerates).
3. For each of `apps/web`, `apps/mailops`, `packages/types`, `packages/database`: `tsc --noEmit` passes.
4. `npm run build` at root (turbo) succeeds for both apps.
5. `npm run lint` at root passes.
6. Runtime smoke (per `../HANDoff.md`): boot both apps; hit auth boundary (401 without token); hit tracking endpoint; enqueue a queue job.

## Risks & rollback
- **TS 6** is the riskiest item here. If `tsc` fails in a package with errors that aren't quick fixes, **split TS 6 into its own branch** and revert just that commit — keep the rest of Step 0.
- **Dead-dep removal** is fully reversible (re-add to `package.json` + `npm install`).
- **`@types/node@24`** occasionally surfaces new strictness on `fs`/`http` overloads; fix as they appear.
- Rollback: `git revert` the offending commit(s); the changes are additive/isolated.
