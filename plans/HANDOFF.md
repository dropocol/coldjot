# Refactor Hand-off — `refactor/old-code-update`

> Branch: `refactor/old-code-update`. Read this before deploying. It lists what was implemented, what is **blocked on you** (operational/destructive actions I should not do blind), and how to verify.

---

## ✅ Implemented (7 commits, all typecheck-clean)

| Commit | Plan | Summary |
|---|---|---|
| `421783f` | 01 | Closed IDOR + mass-assignment; added `requireAuth`/`findForeignContactIds`/`isNotFound` helpers; consolidated the duplicate Prisma client; fixed the broken step-reorder TODO |
| `15f97db` | 04 | Added zod schemas + `parseBody`/`parseQuery`; wired validation into contacts, lists, sequences, steps, launch, drafts, apollo search; clamped pagination |
| `050345b` | 05 | Restored the no-op tracking endpoint (now proxies to mailops); made `/api/track` public; validated event types; fixed `x-forwarded-for` parsing; added safe-redirect + enum validation in mailops |
| `039f358` | 08 | Added a redacting `logger`; deleted OAuth-token/PII console.logs in the Gmail callback/auth routes; cleaned all API-route console.logs; removed dead debounce hook + empty `ui/backup` |
| `7e37086` | 09 | Added pino `redact` config; removed the SMTP `console.log(token)`; stopped logging `req.headers`/raw PubSub body/full `job.data`/sequence content |
| `5276fc9` | 03 | Added `requireServiceToken` middleware; gated `/api`, `/api/mailbox`, `/api/lists`; CORS allowlist; fixed the PubSub always-200 error handler; web now sends `X-Service-Token` everywhere; fixed a shadowed `env` export bug |
| `b789f1e` | 11 | Removed accidental `i` + `npm` deps; added a mailops ESLint config |

All changes typecheck (`tsc --noEmit`) for both `apps/web` and `apps/mailops`.

---

## 🔴 Blocked on YOU — do these before deploying

These require operational access (dashboards, the production DB) or carry destructive risk. I did **not** do them.

### 1. Generate `SERVICE_INTERNAL_TOKEN` and set it in both apps (REQUIRED for the app to boot)

Plan 03 made `SERVICE_INTERNAL_TOKEN` (mailops) and `MAILOPS_SERVICE_TOKEN` (web) **required** env vars — the zod schemas will crash at boot if either is missing, and mailops rejects every internal request without it.

```bash
openssl rand -hex 32
```

Set the **same value** as:
- `MAILOPS_SERVICE_TOKEN` in `apps/web/env/.env.*`
- `SERVICE_INTERNAL_TOKEN` in `apps/mailops/env/.env.*`

Without this, neither app will start after you pull this branch.

### 2. Rotate leaked secrets (plan 02a) — HIGHEST IMPACT, ~30 min

Real production secrets are sitting on disk in `apps/*/env/.env.production` and `.env.extra`. They're gitignored, but physically present. Assume compromised-by-default and rotate, in this order:

1. **Audit git history** for accidental commits:
   ```bash
   git log --all --full-history -- \
     'apps/web/env/.env.production' 'apps/web/env/.env.extra' \
     'apps/mailops/env/.env.production' 'packages/database/env/.env.production'
   ```
   If anything shows, the secret is in the git object DB — purge with `git filter-repo`/BFG and force-push.
2. **Rotate** (generate new values, update the running deploy, then delete the on-disk files):
   - Production DB password (in `DATABASE_URL`)
   - `NEXTAUTH_SECRET`, `ENCRYPTION_KEY` (`openssl rand -base64 32`)
   - Google OAuth secrets (Google Cloud Console → Credentials → "Reset secret" — **this invalidates all existing refresh tokens; users must re-connect mailboxes**)
   - `APOLLO_API_KEY`, `DEEPSEEK_API_KEY`, `PUBSUB_VERIFICATION_TOKEN`, `CRON_SECRET`
   - Google service-account private key (re-issue in Google Cloud)
3. **Delete** the on-disk secret files after the new values are live in your deploy:
   ```bash
   rm apps/web/env/.env.production apps/web/env/.env.extra
   rm apps/mailops/env/.env.production apps/mailops/env/.env.extra
   rm packages/database/env/.env.production packages/database/env/.env.development
   ```
4. Move all secret delivery off-disk (Vercel env vars / `systemd` EnvironmentFile / `sops`).

⚠️ **Rotating `ENCRYPTION_KEY`** invalidates any existing OAuth `state` CSRF tokens (fine — short-lived) but will also lock any data encrypted with it. Currently only the OAuth `state` uses it, so rotation is safe. **Do not** rotate `ENCRYPTION_KEY` after plan 02b (token encryption) is implemented without the dual-key path described in plan 02b.

### 3. DB migrations — plans 02b (token encryption) and 06 (schema) — NOT implemented

I deliberately did **not** write or run any Prisma migrations. These need a DB backup + staging test:

- **02b — encrypt OAuth tokens at rest** (`Mailbox`/`Account` `access_token`/`refresh_token`/`id_token`). Currently plaintext. Requires a Prisma extension + a backfill migration + a dual-read window.
- **06 — add missing indexes** (`Session.userId`, `Template.userId`, `Draft.contactId`/`templateId`, `EmailEvent.contactId`/`sequenceId`), explicit cascade policy, optional soft-deletes.

Follow plans 02b and 06 directly — they have the migration SQL, backfill scripts, and rollback notes.

---

## 🟡 Deferred (lower-risk, do later)

Captured in commit messages; repeating here for visibility:

- **Plan 11 remainder:** `date-fns` v2→v4 + `googleapis` version alignment across both apps (breaking, needs testing); consolidate on BullMQ and remove legacy `bull`; remove TipTap if confirmed unused; full `process.env.X → env.X` sweep; tsconfig target bump.
- **Plan 07 (frontend data-fetching consolidation on react-query):** large, incremental — untouched.
- **Plan 08 remainder:** ~130 `console.log` remain in **component** files (UI debug logs, lower risk than the API/token logs which are all cleaned). Re-enable the disabled ESLint rules (`no-explicit-any`, `exhaustive-deps`, `rules-of-hooks`) phased to `warn` then `error`.
- **Plan 10 (BullMQ retries/DLQ/idempotency):** untouched. Note: if you proceed with the **mailops consolidation** (`plans/mailops-consolidation/`), plan 10 becomes moot.
- **Testing baseline:** now lives in its own plan area at [`testing/`](./testing/README.md) (formerly tracked as `refactor-plan/12`). Untouched.

---

## How to verify before merging

1. `git checkout refactor/old-code-update`
2. Set the new env vars (`SERVICE_INTERNAL_TOKEN` / `MAILOPS_SERVICE_TOKEN`, plus rotated secrets).
3. `npm install` (root package.json changed).
4. `npm run build` — both apps should build.
5. **Smoke test the auth boundary:** with mailops running, `curl -X POST http://localhost:3001/api/sequences/x/launch -H "Content-Type: application/json" -d '{}'` → should return **401** (no token). With the header → should proceed.
6. **Smoke test IDOR:** as user B, try to add user A's contact to user B's list → should get 403/404 (was 200).
7. **Smoke test tracking:** open a tracked email → confirm an event is now recorded (was a no-op).

---

## Branch hygiene

- 8 commits, each scoped to one plan, each typechecks.
- No migrations, no deleted data, no force-pushes.
- Safe to merge to `master` once you've set the env vars and done the smoke tests; the secret rotation (item 2 above) can follow but should not be delayed.
