# Plan 11 — Tooling, Config & Dependency Alignment

> **Severity:** 🟡 MEDIUM
> **Effort:** Medium (~1 day)
> **Depends on:** Nothing. Enables plans 02, 03, 04, 09 (they all reference a centralized `env.ts` and shared types).

---

## Problem

Several configuration and dependency inconsistencies make the codebase harder to reason about and block the other refactors.

### 1. `env.ts` exists but is bypassed

`apps/web/src/env.ts` is a proper zod-validated env module — but it's imported in **exactly one file** (`lib/queue/queue-api-client.ts:1`). Everywhere else reads `process.env.X!` directly:

- `lib/auth.config.ts:29,30,126,127` — `GOOGLE_CLIENT_ID!`, `GOOGLE_CLIENT_SECRET!`
- `lib/google/gmail.ts:10,11,113,114,128–130`
- `lib/google/google-account.ts:46–55`
- `lib/crypto.ts:5,7` — `ENCRYPTION_KEY` with fallback to `""`
- `config/test.ts:1` — `TEST_MODE` (a non-`NEXT_PUBLIC_` var)
- `lib/queue-client.ts:4`

Secrets accessed via `!` aren't validated at boot — a missing `GOOGLE_CLIENT_SECRET_EMAIL` only surfaces when someone connects a mailbox.

`apps/mailops/src/config/env.ts` has the same problem: the `envSchema` (L14–37) validates only DB/Redis/queue/logging vars. Google/SMTP/PubSub secrets are read ad-hoc with `!` (see plan 02 for locations).

### 2. Dependency version drift between apps

| Package | web | mailops | Issue |
|---|---|---|---|
| `date-fns` | `^4.1.0` | `^2.30.0` | **Major version split** — v2 and v4 have different APIs (e.g. `formatInTimeZone`) |
| `date-fns-tz` | `^3.2.0` | `^2.0.0` | Major split |
| `googleapis` | `^144.0.0` | `^126.0.1` | 18 minor versions apart |
| `pino` / `pino-pretty` | `^8.17.0` / `^10.3.0` | `^8.21.0` / `^10.3.1` | Minor drift |
| `bull` + `bullmq` | web has `bull@^4.12.0` only | mailops has both `bull@^4.11.3` AND `bullmq@^5.34.5` | **Two queue libraries** in the same service (see #4) |

### 3. ESLint config is permissive (web) or absent (mailops)

`apps/web/.eslintrc.json` disables `no-explicit-any`, `no-unused-vars`, `rules-of-hooks`, `exhaustive-deps`, `prefer-const` (covered in plan 08).

**`apps/mailops` has no ESLint config at all** — `find apps/mailops -name ".eslintrc*"` returns nothing, yet `package.json` has `"lint": "eslint "src/**/*.ts""` and depends on `eslint@^8.49.0`. The lint script either uses a root config that doesn't exist or silently passes.

### 4. Two queue libraries

`apps/mailops` imports both `bull` (the old one) and `bullmq` (the new one). Per the grep, `bull` is imported in `config/queue/index.ts`, `services/monitor/service.ts`, `services/shared/redis/connection.ts`, `services/service-manager.ts`, and several processors. `bullmq` is the active modern fork. Mixing them risks two Redis connection pools and inconsistent job semantics.

### 5. `apps/web` has both Lexical AND TipTap editors

`package.json` lists `@lexical/*` (8 packages, `^0.25.0`) **and** `@tiptap/*` (4 packages, `^2.9.1`). Two rich-text editor stacks. The active editor is Lexical (`components/editor/`); TipTap appears largely unused — verify before removing.

### 6. Root + per-package scripts duplication

The web app's `package.json` scripts use `export APP_ENV=development &&` inline (`build`, `start`, `build:dev`). This is fragile (doesn't work on Windows; relies on a specific shell). Turbo's `globalPassThroughEnv` already handles `APP_ENV`.

### 7. `i` and `npm` as devDependencies

Root `package.json:40–41`:
```json
"i": "^0.3.7",
"npm": "^10.9.2",
```
`i` is an interactive npm CLI helper — almost certainly an accidental `npm install i`. Listing `npm` as a devDependency is also unusual (it's bundled with Node). Both should be removed.

### 8. Two Prisma client instances?

`apps/web/src/app/api/admin/users/[id]/route.ts:3` imports `prisma` from `@/lib/prisma`, while every other file uses `@coldjot/database`. If `lib/prisma.ts` creates its own `PrismaClient`, that's a second connection pool. Verify and consolidate.

### 9. `tsconfig` target is old

Root `tsconfig.json` targets `es2017`. Node 20+ supports much newer syntax. Not breaking, but `target: "es2022"` enables top-level await, native error causes, etc.

### 10. Docker-compose hardcoded dev credentials

`docker-compose.yml` hardcodes `POSTGRES_USER: postgres` / `POSTGRES_PASSWORD: postgres`. Fine for local dev, but should be clearly documented as dev-only (and ideally overridden via a `.env` so it's not in version control even as a default).

---

## Goal

1. **One `env.ts` per app**, fully covering every secret the app reads, validated at boot, imported everywhere — no more `process.env.X!`.
2. Dependency versions **aligned across apps** where the package is shared.
3. **ESLint configured and enforced** in both apps with a shared base config.
4. **One queue library** (BullMQ) in mailops; `bull` removed.
5. Dead/unused dependencies removed (`i`, `npm`, possibly TipTap, possibly one of Lexical/TipTap).
6. One Prisma client instance.
7. Modernized `tsconfig` target.

---

## Implementation steps

### Step 1 — Centralize env access (web)

Expand `apps/web/src/env.ts` to cover every var the app reads:

```ts
import { z } from "zod";

const envSchema = z.object({
  // Runtime
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_ENV: z.enum(["development", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // Public (exposed to client)
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_APP_ENV: z.string().optional(),
  NEXT_PUBLIC_MAILOPS_API_URL: z.string().url(),

  // Secrets
  NEXTAUTH_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().min(16),
  DATABASE_URL: z.string().url(),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CLIENT_ID_EMAIL: z.string().min(1),
  GOOGLE_CLIENT_SECRET_EMAIL: z.string().min(1),
  GOOGLE_REDIRECT_URI_EMAIL: z.string().url(),

  MAILOPS_SERVICE_TOKEN: z.string().min(16), // plan 03
  APOLLO_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
```

Then **replace every `process.env.X` with `env.X`** across `apps/web/src`. Delete the `dotenv.config()` call at the top of `env.ts` (Next.js loads `.env*` automatically; the `// TODO: check if this is needed` confirms it's suspect).

### Step 2 — Centralize env access (mailops)

Extend `apps/mailops/src/config/env.ts` similarly — add `GOOGLE_CLIENT_ID_EMAIL`, `GOOGLE_CLIENT_SECRET_EMAIL`, `GOOGLE_REDIRECT_URI_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `SERVICE_INTERNAL_TOKEN`, `PUBSUB_AUDIENCE` (see plan 03's note about the ngrok fallback).

### Step 3 — Remove the PubSub ngrok fallback

`apps/mailops/src/config/pubsub/constants.ts:9–12,32` falls back to a hardcoded ngrok URL. Replace with a required env var (validated in Step 2) that fails loudly if unset:
```ts
export const PUBSUB_AUDIENCE = env.PUBSUB_AUDIENCE;
```

### Step 4 — Align shared dependency versions

Pick the newer version and align both apps:

| Package | Target |
|---|---|
| `date-fns` | `^4.1.0` (mailops needs code changes — v2→v4 has breaking changes; do carefully) |
| `date-fns-tz` | `^3.2.0` |
| `googleapis` | `^144.0.0` |
| `pino` / `pino-pretty` | align to newest `^8.x` |

> **`date-fns` v2→v4 is the riskiest** — it changes imports (`formatInTimeZone` moved) and some signatures. Audit mailops's date usage first; if the blast radius is large, consider leaving mailops on v2 temporarily and tracking the upgrade separately.

### Step 5 — Remove `bull` from mailops (consolidate on BullMQ)

1. Grep for every `from "bull"` import (list in Problem #4).
2. For each, migrate to the `bullmq` equivalent (`Queue`, `Worker`, `Job` from `bullmq`). The APIs are similar but not identical.
3. Remove `bull` and `@types/bull` from `package.json`.
4. Verify queue behavior end-to-end (enqueue, process, complete, fail).

> If `bull` is only used by the `@bull-board` integration or legacy monitor code, the migration may be small. Audit first.

### Step 6 — Pick one editor (Lexical or TipTap)

Audit usage:
```bash
rg -n "@tiptap" apps/web/src
rg -n "@lexical" apps/web/src
```
If TipTap is only used in `components/editor-old/` (which plan 08 deletes), remove the `@tiptap/*` dependencies. If both are actively used in different features, pick one and plan a consolidation (out of scope for this plan — file a follow-up).

### Step 7 — Remove accidental / unused devDependencies

From root `package.json`, remove:
```json
"i": "^0.3.7",
"npm": "^10.9.2",
```
Run `npm install` to update the lockfile.

Audit other potentially-unused deps with `depcheck`:
```bash
npx depcheck
```
Remove confirmed unused. (Don't trust depcheck blindly — it has false positives for dynamically-imported modules.)

### Step 8 — Consolidate to one Prisma client

Check `apps/web/src/lib/prisma.ts`. If it creates its own `PrismaClient`, delete it and re-export from `@coldjot/database`:
```ts
// apps/web/src/lib/prisma.ts
export { prisma } from "@coldjot/database";
```
Then update `apps/web/src/app/api/admin/users/[id]/route.ts:3` to import from `@coldjot/database` (plan 01).

### Step 9 — Configure ESLint for mailops

Create `apps/mailops/.eslintrc.json` mirroring the web config (after plan 08 re-enables rules):
```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "parserOptions": { "project": "./tsconfig.json" },
  "plugins": ["@typescript-eslint"],
  "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  "rules": {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]
  }
}
```
Add `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin` to mailops devDependencies. Run `npm run lint` in mailops and address the warnings.

### Step 10 — Fix the web build scripts

Replace the inline `export APP_ENV=...` in `apps/web/package.json`:
```json
"build": "next build",
"build:dev": "APP_ENV=development next build",
"build:prod": "APP_ENV=production next build",
```
And ensure `turbo.json`'s `globalPassThroughEnv` includes `APP_ENV` (it does). Remove the `export` form (POSIX-only).

### Step 11 — Modernize tsconfig target

In root `tsconfig.json`, bump `target` to `es2022` and `lib` accordingly. Verify both apps still build. (Per-app tsconfigs override where needed.)

### Step 12 — Docker-compose hygiene

Add a comment to `docker-compose.yml` clarifying it's dev-only, and ideally read credentials from `.env`:
```yaml
postgres:
  environment:
    POSTGRES_USER: ${POSTGRES_USER:-postgres}
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
    POSTGRES_DB: ${POSTGRES_DB:-coldjot_dev}
```

---

## Files to touch

**Modify:**
- `apps/web/src/env.ts` (expand schema, remove dotenv)
- `apps/mailops/src/config/env.ts` (expand schema)
- `apps/mailops/src/config/pubsub/constants.ts` (remove ngrok fallback)
- Every file reading `process.env.X!` → replace with `env.X` (many)
- `apps/web/package.json`, `apps/mailops/package.json` (align versions, remove `bull`/TipTap if unused)
- Root `package.json` (remove `i`, `npm`)
- `apps/web/src/lib/prisma.ts` (re-export or delete)
- `apps/web/src/app/api/admin/users/[id]/route.ts` (import from `@coldjot/database`)
- `apps/web/.eslintrc.json` (plan 08 changes)
- Create `apps/mailops/.eslintrc.json`
- Root `tsconfig.json` (target)
- `apps/web/package.json` (build scripts)
- `docker-compose.yml`

---

## Verification

- Both apps boot with a **missing** required env var → crash at startup with a clear zod error (not a silent failure later).
- Both apps boot with all env vars present → normal startup.
- `npm run lint` works in **both** apps (mailops previously had no config).
- `npm run build` succeeds for both apps after dependency alignment.
- `grep -r "from \"bull\"" apps/mailops/src` returns nothing.
- `grep -r "process.env.GOOGLE" apps/web/src` returns nothing (all routed through `env`).
- Only one `PrismaClient` instance exists (grep `new PrismaClient` — should be exactly one, in `packages/database/src/index.ts`).

---

## Risks & rollback

- **`date-fns` v2→v4 upgrade** can break date formatting across mailops. Do it in isolation with tests; if risky, defer and keep the split temporarily.
- **Removing `bull`** requires every queue/worker to be BullMQ-compatible. Test each queue's lifecycle after migration.
- **Removing TipTap** if it's actually used somewhere will break that feature. Audit thoroughly (`rg "@tiptap"`).
- **`env.parse` at boot** means a missing var crashes the app — that's the point, but make sure your deploy pipeline sets every var before the new build rolls out.
- **`tsconfig` target bump** rarely breaks things, but if a shared package emits `es2017`-incompatible code, align its tsconfig too.
- **Rollback:** per-package; revert `package.json` + lockfile + the import changes. The env centralization is additive (revert by re-adding `process.env.X!`).
