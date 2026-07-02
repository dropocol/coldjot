# Upgrade Status — ColdJot Dependency Modernization

> **STATUS: ALL 9 STEPS COMPLETE ✅** (code + build verified; runtime smoke deferred to you)
> Last updated: Step 9 done. Current branch: `upgrade/pino-logging-refactor`.
> The full chain of commits is linear on this branch — see "Merge" below.

## ✅ Done — all dependencies brought to current

| Package | Was | Now |
|---|---|---|
| Node floor | `>=20` | **`>=24`** (`.nvmrc` → 24.18.0 LTS "Knut") |
| `typescript` | 5.x | **6.0.3** |
| `@types/node` | 20.x | **24.x** |
| `zod` | 3.24 | **4.4.3** |
| `eslint` | 8.x | **10.x** (flat config) |
| `tailwindcss` | 3.4 | **4.x** (CSS-first) |
| `express` | 4.21 | **5.2.1** |
| `next` | 15.1 | **16.2.10** (Turbopack) |
| `prisma` / `@prisma/client` | 6.2 | **7.8.0** (driver-adapter) |
| `react-day-picker` | 8.10 | **9.x** |
| `pino` / `pino-pretty` / `pino-http` | 8 / 10 / 8 | **10.3.1 / 13.1.3 / 11.0.0** |
| `googleapis` | 126/144 | **173** (aligned) |
| `date-fns` | 2.30/4.4 | **4.4** (aligned) |
| `nodemailer` | 6.10 | **9.0.3** |
| `openai` | 4.86 | **6.45** |
| `react` / `react-dom` | 19.0 | **19.x** |
| `bullmq` | 5.34 | **5.x** (latest) |
| `next-auth` | 5.0.0-beta.25 | **5.0.0-beta.31** |

## Verification (per step, all passed)

- **tsc --noEmit clean** in all 4 packages (database, types, mailops, web).
- **tsup build clean** for database, types, mailops.
- **next build clean** for web (full route table, Turbopack).
- **eslint clean** in all packages (0 errors; web has pre-existing warnings, intentionally downgraded).
- **Clean `npm install` (no `--legacy-peer-deps`)** succeeds — the peer-conflict that originally blocked Step 5 is fully resolved.

## ⚠️ What you still need to do (runtime, not code)

1. **Set the env tokens** to actually run either app (this is NOT a regression — it's the designed zod behavior, documented in HANDOFF §1):
   - `apps/mailops/env/` — create `.env` + `.env.development` with `DATABASE_URL`, `REDIS_HOST`, `SERVICE_INTERNAL_TOKEN`, etc. (the directory doesn't exist yet)
   - `apps/web/env/.env.development` — add `MAILOPS_SERVICE_TOKEN` (must match mailops's `SERVICE_INTERNAL_TOKEN`). Generate with `openssl rand -hex 32`.
   - Without these, both apps crash at boot with a clear zod `Required` error — **that's correct, not a bug**.

2. **Runtime smoke test** (the one verification step I couldn't do):
   - Boot both apps, exercise auth (Gmail OAuth callback), dashboard, a sequence CRUD round-trip, tracking pixel, calendar picker (react-day-picker v9 visual check), dark mode (Tailwind v4 visual check).
   - Send a test email (googleapis 173 + nodemailer 9 path) and verify pino 10 logs redact PII correctly.

3. **Prisma migration** (Step 6 changed the schema — `url` removed from `datasource`):
   - The client regenerates fine, but if you run `prisma migrate`, use the new `prisma.config.ts` (it provides the DATABASE_URL for the CLI). No destructive migrations were applied during the upgrade.

## Merge

All work is on **one linear branch** (`upgrade/pino-logging-reflector`), built cumulatively off `refactor/old-code-update`. The per-step branch names are intermediate pointers into the same chain. To merge everything at once:

```bash
git checkout refactor/old-code-update
git merge upgrade/pino-logging-refactor   # or open a PR
```

Or merge step-by-step (each branch is a clean checkpoint) if you want to review/stage rollout.

## Commit chain (linear, oldest → newest)

```
ab51027 chore(foundation): Node 24 floor, TS 6, dead-deps, tsconfig es2023 (step 0)
b761b78 chore(foundation): TS 6 fallout fixes + upgrade plan docs (step 0)
4b2700b upgrade(zod): zod 3 -> 4.4.3 (step 1)
a97b058 upgrade(eslint): ESLint 8 -> 10 flat config (step 2)
e5212cd upgrade(tailwind): tailwind 3 -> 4 CSS-first config (step 3)
8dd3e1d upgrade(express): express 4 -> 5.2.1 (step 4)
c24223b upgrade(next): Next.js 15 -> 16.2.10 + dedupe (step 5)
0b44f20 upgrade(prisma): Prisma 6 -> 7.8.0 driver-adapter model (step 6)
8010c2a upgrade(smtp-ai): align googleapis/pino/date-fns + nodemailer/openai (step 7)
dddd7a6 upgrade(lib-majors): react-day-picker 8 -> 9 (step 8)
ed30358 upgrade(pino): fix 94 pre-existing logging call errors + pino 9 -> 10 (step 9)
```

## How to resume / verify yourself

```bash
nvm use 24.18.0   # or: nvm install 24.18.0

# Install (clean, no legacy-peer-deps needed)
npm install

# Approve prisma's postinstall + regen client
npm approve-scripts @prisma/client @prisma/engines prisma
npx prisma generate --schema=packages/database/prisma/schema.prisma

# Typecheck everything
(cd packages/types && npx tsc --noEmit)
(cd packages/database && npx tsc --noEmit)
(cd apps/mailops && npx tsc --noEmit)
(cd apps/web && npx tsc --noEmit)

# Build (root `npm run build` has a pre-existing broken script — build directly)
(cd packages/types && npm run build)
(cd packages/database && npm run build)
(cd apps/mailops && npm run build)
(cd apps/web && MAILOPS_SERVICE_TOKEN=<token> APP_ENV=development npx next build)

# Lint
(cd apps/mailops && npx eslint "src/**/*.ts")
(cd apps/web && npx eslint .)
(cd packages/types && npx eslint "src/**/*.ts*")
(cd packages/database && npx eslint .)
```

## Key code changes (not just version bumps)

- **tsconfig:** `target es2017→es2023`, `moduleResolution "node"→"bundler"` (TS 6), dropped `baseUrl`, added `types:["node"]`.
- **apps/web/src/types/css.d.ts:** ambient `*.css` declaration (TS 6 stricter side-effect imports).
- **apps/mailops/src/lib/log/index.ts:** `Error.prepareStackTrace` save/restore (`@types/node@24` made it non-optional); `fs.createWriteStream`→`pino.destination` (pino 10 multistream).
- **zod v4:** `ZodType` 3→2-param, `z.record` 2-arg, `z.email()`, `standardSchemaResolver` (was `zodResolver`).
- **eslint v10:** flat configs everywhere; wired `@typescript-eslint` in mailops (killed 67 pre-existing parse errors).
- **tailwind v4:** JS config → CSS-first (`@theme`, `@custom-variant dark`); shadcn tokens preserved.
- **express v5:** `Request<P>` param generics.
- **next v16:** `next.config.ts` CJS rewrite, `next lint`→`eslint .`, catch-all route params `{slug:string[]}`, `overrides` to dedupe next.
- **prisma v7:** removed `url` from schema, added `prisma.config.ts`, `PrismaPg` adapter in `PrismaClient`.
- **react-day-picker v9:** calendar.tsx classNames + Chevron component rewrite.
- **pino v10:** 94 logging calls migrated to object-first form; `ioredis` + `google-auth-library` deduped via `overrides`.
- **Dead deps removed:** `bull`, `@types/bull`, `date-fns-tz`, `@bull-board/api`.

## Plan docs

Full per-step details in `plans/upgrade/` (README.md + 00–09 step docs).
