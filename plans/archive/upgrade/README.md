# ColdJot — Dependency Upgrade Plan (bring everything to current)

> Status: **in progress**. Branch base: `refactor/old-code-update`.
> Goal: upgrade every dependency to the current major, one branch per major, merged when green.

## Decisions (locked)

- **Node floor:** `>=24` (latest LTS = **24.18.0**, codename "Knut"). Add `.nvmrc` + `engines` to every package; bump `@types/node` to `^24` everywhere.
- **Branching:** one branch + PR **per step**, off `refactor/old-code-update`, in dependency order. Each branch starts from the previously merged branch.
- **Verification bar:** build + typecheck + lint for both apps, **plus** runtime smoke tests (auth boundary, tracking endpoint, queue enqueue) per `../HANDoff.md`.
- **"Everything current"** — confirmed latest majors (checked via `npm view`):

| Package | Was | Target latest | Step |
|---|---|---|---|
| `node` | 22.14.0 / `>=20` | **24.18.0** / `>=24` | 0 |
| `typescript` | 5.x | **6.0.3** | 0 |
| `@types/node` | 20.x | **26.x** | 0 |
| `prisma` / `@prisma/client` | 6.2 | **7.8.0** | 6 |
| `zod` | 3.24 | **4.4.3** | 1 |
| `eslint` | 8.x | **10.6.0** | 2 |
| `tailwindcss` | 3.4 | **4.3.2** | 3 |
| `express` | 4.21 | **5.2.1** | 4 |
| `next` | 15.1 | **16.2.10** | 5 |
| `react` / `react-dom` | 19.0 | **19.2.7** | 0/5 |

## Step order (lowest-risk foundations first)

| # | Branch | Scope | Doc |
|---|---|---|---|
| 0 | `chore/align-foundation` | Node 24 floor, dead-dep removal, tsconfig es2023, TS 6, npm update within majors | [`00-align-foundation.md`](./00-align-foundation.md) |
| 1 | `upgrade/zod-4` | both apps; zod 3 → 4 | [`01-zod-4.md`](./01-zod-4.md) |
| 2 | `upgrade/eslint-9` | both apps + packages; eslint 8 → 10 (flat config) | [`02-eslint-10.md`](./02-eslint-10.md) |
| 3 | `upgrade/tailwind-4` | apps/web; tailwind 3 → 4 (CSS-first) | [`03-tailwind-4.md`](./03-tailwind-4.md) |
| 4 | `upgrade/express-5` | apps/mailops; express 4 → 5 | [`04-express-5.md`](./04-express-5.md) |
| 5 | `upgrade/next-16` | apps/web; next 15 → 16 | [`05-next-16.md`](./05-next-16.md) |
| 6 | `upgrade/prisma-7` | packages/database + consumers; prisma 6 → 7 | [`06-prisma-7.md`](./06-prisma-7.md) |
| 7 | `upgrade/smtp-ai-minors` | align googleapis/pino/date-fns; nodemailer/openai minors | [`07-smtp-ai-minors.md`](./07-smtp-ai-minors.md) |
| 8 | `upgrade/lib-majors` | react-day-picker 8→9 + other peer-conflict/library majors | [`08-lib-majors.md`](./08-lib-majors.md) |
| 9 | `upgrade/pino-logging-refactor` | fix 94 pre-existing pino call-site type errors + bump pino 9→10 | [`09-pino-logging-refactor.md`](./09-pino-logging-refactor.md) |

> Step 5 (Next 16) is highest-risk → done late. Step 6 (Prisma 7) requires a DB client regen + is isolated to the database package, so it can slot after Next.

## Cross-cutting rules (apply to every step)

- **One commit per logical change** inside each branch (e.g. "bump zod", "migrate ZodType"), so reverts are surgical.
- **Lockfile** (`package-lock.json`) is regenerated and committed on each branch.
- **No DB migrations, no secret rotation** — those stay in `../HANDoff.md`'s "blocked on you" list, untouched here.
- After each step: `tsc --noEmit`, `npm run build`, `npm run lint` for both apps; then runtime smoke per `../HANDoff.md`.
- I'll update `../HANDoff.md` at the end of each step with what changed + how to verify.

## Out of scope (deliberately)

Plan 11's non-dependency items (env centralization sweep, editor consolidation Lexical/TipTap). These are code-quality refactors, not version bumps. Note: `bull` removal (a Plan 11 item) is **moot** — `bull` is unused; we remove it in Step 0.
