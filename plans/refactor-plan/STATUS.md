# Refactor Plan — Status

> **Quick reference:** see the table below for the status of every plan at a glance. Detailed per-plan notes follow in the "Plan-by-plan status" section.
>
> **Legend:** ✅ Done · 🟢 Code done, operator action needed · 🟡 Code done, awaiting verification · ⏸️ Blocked/Deferred · ⬜ Not started

## At-a-glance status

| # | Plan | Status | Notes |
|---|---|---|---|
| [01](./01-security-idor-authorization.md) | IDOR + authorization layer | ✅ **DONE** | committed `fa69382` |
| [02](./02-security-secrets-credentials.md) | Rotate secrets + encrypt OAuth tokens | 🟢 **CODE DONE — 2 operator steps left** | rotate secret values; run `wipe-oauth-tokens.ts` + re-login Gmail |
| [03](./03-security-mailops-auth-cors.md) | Service auth + CORS allowlist | ✅ **DONE** | committed `fd6c416` |
| [04](./04-security-input-validation.md) | zod validation across API routes | ✅ **DONE** | committed `a2629d5` |
| [05](./05-security-tracking-webhook.md) | Fix no-op tracking + open redirect | ✅ **DONE** | committed `42941ae` |
| [06](./06-database-schema.md) | Indexes, cascade/soft-delete, migration hygiene | ⏸️ **DEFERRED — last** | owner decision: do at the very end; needs DB backup + staging |
| [07](./07-frontend-data-fetching.md) | Consolidate on react-query | ✅ **DONE** | whole web app on typed `api` + react-query; ~50 components migrated |
| [08](./08-frontend-code-quality.md) | Remove console.log/any, dead code, lint | ✅ **DONE** | `any` 76→0; lint 0 errors / 0 warnings; all rules `error` |
| [09](./09-backend-logging-pii.md) | Redact PII/tokens from logs | ✅ **DONE** | committed `70b3b74` |
| [10](./10-backend-job-resilience.md) | BullMQ retries/backoff/DLQ | 🟡 **CODE DONE — awaiting smoke-test** | committed `e2e2e77`; DLQ `:`-naming bug fixed in plan 13 |
| [11](./11-tooling-config-dependencies.md) | Align deps, consolidate env, eslint config | ✅ **SUPERSEDED** | covered by the dependency-upgrade pass |
| [12](./12-testing-strategy.md) | Testing baseline | ⏸️ **BLOCKED on plan 10 smoke-test** | start only after plan 10 verified |
| [13](./13-monorepo-scripts-devexperience.md) | Monorepo scripts, Turbo, dev-experience cleanup | ✅ **DONE** | committed `945b08c` + `3d9969b`; build/typecheck/lint green |
| [14](./14-centralize-shared-config-ui.md) | Centralize config + extract `packages/ui` + Radix→Base UI | ✅ **DONE** | `@coldjot/tsconfig`, `@coldjot/eslint-config`, `@coldjot/ui` (base-ui), sonner, next-themes, prettier |

**Totals:** 10 done · 1 awaiting owner action (02) · 1 awaiting smoke-test (10) · 2 blocked/deferred (06, 12) · 1 superseded (11) — **0 not started.**

---

> **Last updated:** plan 14 follow-up — fixed three classes of post-migration runtime errors (nested-`<button>` hydration via an `asChild→render` codemod across 26 files, `MenuGroupContext` missing in Sidebar, Prisma Symbol serialization across 4 Server→Client boundaries). No shadcn components modified. Plan 10 (BullMQ resilience) still **awaiting owner smoke-testing**. Plan 06 deferred to the very end. Plan 12 blocked on plan 10.
>
> **Two parallel workstreams** live on two branch chains off `master`:
>
> - **Security/quality refactor** → `refactor/old-code-update` (plans 01, 03, 04, 05, 09, + part of 11)
> - **Dependency modernization + plans 08, 13, 14** → `upgrade/remaining-majors` (built on top of `refactor/old-code-update`; supersedes most of plan 11; also completed plans 08, 13, 14)
>
> Read `../HANDOFF.md` for the deploy-blocking operational items (env tokens, secret rotation, DB migrations).
>
> ## 🔵 Architecture decision — mailops consolidation postponed
>
> `plans/mailops-consolidation/` was evaluated and **deliberately postponed** (not adopted now; may revisit in the future). Consequences:
>
> - **Plan 10 (BullMQ resilience) is NOT moot** — BullMQ stays in production for now, so hardening it (retries, backoff, DLQ, idempotency) is real, valuable work.
> - **Plan 03 (service auth + CORS) stays load-bearing** — the web↔mailops internal auth boundary remains.
> - Do **not** start any consolidation work; revisit the decision later.

---

## Plan-by-plan status


| #                                          | Plan                                            | Status                                   | Where                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------ | ----------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [01](./01-security-idor-authorization.md)  | IDOR + authorization layer                      | ✅ **DONE**                               | `refactor/old-code-update` (`fa69382`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| [02](./02-security-secrets-credentials.md) | Rotate secrets + encrypt OAuth tokens           | 🟢 **CODE DONE — 2 operator steps left** | 02a: git history audited (clean); .gitignore consolidated; boot-time zod validation; Prisma query-logging locked down. 02b: AES-256-GCM field crypto + Prisma `$extends` encrypt-on-write/decrypt-on-read on `Mailbox`/`Account` token fields; wipe script written. **You must:** (1) rotate the actual secret values in their dashboards, (2) run `wipe-oauth-tokens.ts` (DRY_RUN=0) + re-login Gmail so tokens are stored encrypted. `ENCRYPTION_KEY` rotation needs the dual-key path (`ENCRYPTION_KEY_OLD`) |
| [03](./03-security-mailops-auth-cors.md)   | Service auth + CORS allowlist                   | ✅ **DONE**                               | `refactor/old-code-update` (`fd6c416`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| [04](./04-security-input-validation.md)    | zod validation across API routes                | ✅ **DONE**                               | `refactor/old-code-update` (`a2629d5`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| [05](./05-security-tracking-webhook.md)    | Fix no-op tracking + open redirect              | ✅ **DONE**                               | `refactor/old-code-update` (`42941ae`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| [06](./06-database-schema.md)              | Indexes, cascade/soft-delete, migration hygiene | ⏸️ **DEFERRED — last**                   | owner decision: do at the very end once everything else is satisfactory. Needs DB backup + staging (destructive) when started.                                                                                                                                                                                                                                                                                                                                                                                  |
| [07](./07-frontend-data-fetching.md)       | Consolidate on react-query                      | ✅ **DONE**                               | `upgrade/remaining-majors` — see the plan-07 section below. The whole web app now fetches via the typed `api` client + react-query hooks; the hand-rolled `sequence-context` is backed by react-query; ~50 components/pages migrated. `tsc --noEmit` clean, web ESLint 0/0, `next build` passes.                                                                                                                                                                                                                |
| [08](./08-frontend-code-quality.md)        | Remove console.log/any, dead code, lint         | ✅ **DONE**                               | all `console.log` removed; `any` 76→0; unused-vars 335→0; exhaustive-deps 10→0; duplicated `transformEmailData` extracted; dead toolbar files deleted; stale step-reorder TODO resolved. **All ESLint rules now `error`** (no-explicit-any, no-unused-vars, rules-of-hooks, exhaustive-deps, useless-catch, prefer-const, preserve-caught-error, etc.). Web lint fully clean: 0 errors / 0 warnings                                                                                                             |
| [09](./09-backend-logging-pii.md)          | Redact PII/tokens from logs                     | ✅ **DONE**                               | `refactor/old-code-update` (`70b3b74`); pino call-site refactor + pino 10 in upgrade chain                                                                                                                                                                                                                                                                                                                                                                                                                      |
| [10](./10-backend-job-resilience.md)       | BullMQ retries/backoff/DLQ                      | 🟡 **CODE DONE — awaiting smoke-test**    | committed `e2e2e77`; DLQ `:`-naming bug fixed in plan 13. Smoke-test: force 5x failure → confirm job lands in `<name>-dl` and is visible in Bull-Board.                                                                                                                                                                                                                                                                                                                                                          |
| [11](./11-tooling-config-dependencies.md)  | Align deps, consolidate env, eslint config      | ✅ **SUPERSEDED**                         | fully covered by the dependency-upgrade pass (see below) — every dep is now latest                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [12](./12-testing-strategy.md)             | Testing baseline                                | ⏸️ **BLOCKED on plan 10 smoke-test**      | start only after plan 10 verified working                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| [13](./13-monorepo-scripts-devexperience.md) | Monorepo scripts, Turbo, dev-experience cleanup | ✅ **DONE**                               | `upgrade/remaining-majors` (`945b08c` + `3d9969b`). Fixed broken root `dev`/`build`/`start`/`db:*` scripts; rewrote Turbo config; removed dead deps; unified env loading; added `typecheck`/`lint` aggregates; one-command web+mailops dev.                                                                                                                                                                                                                                                                       |
| [14](./14-centralize-shared-config-ui.md)  | Centralize config + extract `packages/ui` + Radix→Base UI | ✅ **DONE**                    | `upgrade/remaining-majors`. Half A: `@coldjot/tsconfig`, `@coldjot/eslint-config`, `.prettierrc`. Half B: `@coldjot/ui` with all 37 shadcn components (base-nova style, Base UI), shared globals.css with oklch theme, next-themes dark mode, sonner toast. Full Radix→Base UI migration with backward-compat `asChild` shims. 146 hardcoded color classes → theme tokens. See the plan-14 section below.                                                                                                          |


---

## ✅ Security/quality refactor — what's done (on `refactor/old-code-update`)

7 commits, each scoped to one plan, each typecheck-clean. Commit hashes changed after a `git filter-repo` history rewrite (the old hashes in `../HANDOFF.md` are stale; use `git log --oneline refactor/old-code-update` for current ones):


| Plan               | What landed                                                                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **01**             | Closed IDOR + mass-assignment; added `requireAuth`/`findForeignContactIds`/`isNotFound` helpers; consolidated duplicate Prisma client; fixed broken step-reorder TODO                                    |
| **03**             | `requireServiceToken` middleware; gated `/api`, `/api/mailbox`, `/api/lists`; CORS allowlist; fixed PubSub always-200 error handler; web sends `X-Service-Token` everywhere; fixed shadowed `env` export |
| **04**             | zod schemas + `parseBody`/`parseQuery`; validation wired into contacts, lists, sequences, steps, launch, drafts, apollo search; clamped pagination                                                       |
| **05**             | Restored no-op tracking endpoint (proxies to mailops); made `/api/track` public; validated event types; fixed `x-forwarded-for` parsing; safe-redirect + enum validation in mailops                      |
| **08** *(partial)* | Redacting `logger`; deleted OAuth-token/PII console.logs in Gmail callback/auth routes; cleaned API-route console.logs; removed dead debounce hook + empty `ui/backup`                                   |
| **09**             | pino `redact` config; removed SMTP `console.log(token)`; stopped logging `req.headers`/raw PubSub body/full `job.data`/sequence content                                                                  |
| **11** *(partial)* | Removed accidental `i` + `npm` deps; mailops ESLint config (the rest of 11 is superseded by the upgrade pass)                                                                                            |


---

## ✅ Dependency modernization — DONE (on `upgrade/remaining-majors`)

Built on top of `refactor/old-code-update`. This supersedes plan 11 entirely. **Every dependency is now on the current major + latest minor/patch.** Full plan in `../upgrade/` (README + per-step docs + STATUS).

### What got upgraded


| Package                                                                                              | Was        | Now                                 |
| ---------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------- |
| Node floor                                                                                           | `>=20`     | `**>=24`** (`.nvmrc` → 24.18.0 LTS) |
| `typescript`                                                                                         | 5.x        | **6.0.3**                           |
| `@types/node`                                                                                        | 20.x       | **26.x**                            |
| `zod`                                                                                                | 3.24       | **4.4.3**                           |
| `eslint`                                                                                             | 8.x        | **10.x** (flat config)              |
| `tailwindcss`                                                                                        | 3.4        | **4.x** (CSS-first)                 |
| `express`                                                                                            | 4.21       | **5.2.1**                           |
| `next`                                                                                               | 15.1       | **16.2.10** (Turbopack)             |
| `prisma` / `@prisma/client`                                                                          | 6.2        | **7.8.0** (driver-adapter model)    |
| `react-day-picker`                                                                                   | 8.10       | **10.x**                            |
| `pino` / `pino-pretty` / `pino-http`                                                                 | 8 / 10 / 8 | **10 / 13 / 11**                    |
| `googleapis`                                                                                         | 126/144    | **173** (aligned)                   |
| `date-fns`                                                                                           | 2.30/4.4   | **4.4** (aligned)                   |
| `nodemailer`                                                                                         | 6.10       | **9.0.3**                           |
| `openai`                                                                                             | 4.86       | **6.45**                            |
| `@lexical/*` + `lexical`                                                                             | 0.25       | **0.46**                            |
| `@tiptap/*`                                                                                          | 2.9        | **3.27**                            |
| `recharts`                                                                                           | 2          | **3**                               |
| `lucide-react`                                                                                       | 0.456      | **1.23**                            |
| `react-markdown`                                                                                     | 9          | **10**                              |
| `react-resizable-panels`                                                                             | 2          | **4**                               |
| `uuid`                                                                                               | 11         | **14**                              |
| `jwks-rsa`                                                                                           | 3          | **4**                               |
| `dotenv`                                                                                             | 16         | **17**                              |
| `jest` / `sinon`                                                                                     | 29 / 19    | **30 / 22**                         |
| `concurrently` / `rimraf`                                                                            | 8 / 5      | **10 / 6**                          |
| `react` / `react-dom`                                                                                | 19.0       | **19.2**                            |
| `bullmq`, `next-auth@beta`, `tailwind-merge`, `luxon`, `@google-cloud/pubsub` (4→5), `ioredis`, etc. | —          | all latest                          |


### Key code changes (not just version bumps)

- **tsconfig:** `target es2017→es2023`, `moduleResolution "node"→"bundler"` (TS 6), dropped `baseUrl`, added `types:["node"]`.
- **zod v4:** `ZodType` 3→2-param, `z.record` 2-arg, `z.email()`, `standardSchemaResolver`.
- **eslint v10:** flat configs everywhere; wired `@typescript-eslint` in mailops (killed 67 pre-existing parse errors).
- **tailwind v4:** JS config → CSS-first (`@theme`, `@custom-variant dark`); shadcn tokens preserved.
- **express v5:** `Request<P>` param generics.
- **next v16:** `next.config.ts` CJS rewrite, `next lint`→`eslint .`, catch-all route params `{slug:string[]}`, `overrides` to dedupe next.
- **prisma v7:** removed `url` from schema, added `prisma.config.ts`, `PrismaPg` adapter in `PrismaClient`.
- **lexical v0.46:** widened `static clone()`/`importJSON()` params to match new base signatures.
- **pino v10:** 94 logging calls migrated to object-first form; `fs.createWriteStream`→`pino.destination`.
- **Dead deps removed:** `bull`, `@types/bull`, `date-fns-tz`, `@bull-board/api`.
- `**MAILOPS_PUBSUB_ENABLED`** env flag added (lets dev boot without GCP creds).

### ⚠️ Carryover from the upgrade (your runtime tasks)

1. **Env tokens still required** to boot: `MAILOPS_SERVICE_TOKEN` (web) / `SERVICE_INTERNAL_TOKEN` (mailops) — see `../HANDOFF.md` §1. Set `MAILOPS_PUBSUB_ENABLED=false` in mailops dev env to skip PubSub.
2. **Visual smoke needed** for API-changing steps: react-resizable-panels v4 (`data-panel-group-direction` selector may need verifying), recharts v3, lucide v1, the Lexical editor.
3. `**prisma.config.ts`** now provides the migration URL (Prisma 7 removed `url` from schema). No destructive migrations were applied.

---

## ✅ Plan 08 — frontend code quality — DONE (on `upgrade/remaining-majors`)

Completed in 6 commits (`bb50c78` → `33d4111`). The web app's ESLint now reports **0 errors / 0 warnings**.

### What got done


| Area                                 | Before | After |
| ------------------------------------ | ------ | ----- |
| Debug `console.log` in web src       | ~93    | **0** |
| `@typescript-eslint/no-explicit-any` | 76     | **0** |
| `@typescript-eslint/no-unused-vars`  | 335    | **0** |
| `react-hooks/exhaustive-deps`        | 10     | **0** |
| Total ESLint warnings (web)          | 439    | **0** |


### Key code changes

- **Logging:** removed all leftover debug `console.log`; migrated operational logs in `google-account`/`gmail` to the redacting `logger`; deleted sensitive logs (auth tokens, userId+refreshToken) from `auth.config` / `google-account`.
- **Types:** typed `sequence-context` via the `Sequence` type; rewrote `sequence-utils` with proper narrowing; extracted duplicated `transformEmailData` into `lib/email/transform.ts`; typed DOM refs, Lucide icons, recharts tooltips, the Gmail API client (`gmail_v1.Gmail`), and Lexical node guards per base-class signatures.
- **Dead code:** deleted two unused `toolbar.tsx` files (50 unused symbols); removed 140 unused imports + 48 empty import statements.
- **Bug-catching fixes:** removed a dead `dupe-else-if` branch, 4 useless-catch wrappers, an empty if-block; attached `cause` to rethrown errors; converted `next.config.ts` CJS `require`s to ESM imports; resolved the stale step-reorder TODO (renumber already implemented).
- **ESLint:** every rule promoted `warn` → `error` (`no-explicit-any`, `no-unused-vars`, `rules-of-hooks`, `exhaustive-deps`, `useless-catch`, `prefer-const`, `preserve-caught-error`, `no-empty`, `no-dupe-else-if`, `no-require-imports`, `no-empty-object-type`). Configured `caughtErrorsIgnorePattern` + `destructuredArrayIgnorePattern` so `_`-prefixed bindings are honored.
- **Type package:** added `metadata` + `contactCount` to the `Sequence` type; widened `EmailData.templateId` to `string | null`; fixed the DTS build (`ignoreDeprecations: "6.0"` unblocked a phantom `baseUrl` deprecation under TS 6).

### ⚠️ Note for reviewers

The Prisma ↔ `@coldjot/types` boundary has a systemic enum-vs-string-literal and `| null` vs optional-field mismatch (`Sequence`, `SequenceStep`). Several `as` casts at those boundaries (`sequences/[id]/layout.tsx`, `sequences/[id]/page.tsx`, `sequence-step-editor.tsx`) are intentional — the runtime shapes are correct, only TS null-precision differs. Reconciling the type definitions with the actual DB string values is a separate task (overlaps with plans 02b/06).

---

## ✅ Plan 07 — frontend react-query consolidation — DONE (on `upgrade/remaining-majors`)

11 commits (`d9d7cce` → final). Consolidated the web app on **one** data-fetching strategy (react-query), retiring the ~50 hand-rolled `useEffect + fetch + useState` blocks and the standalone raw-fetch `sequence-context`. `tsc --noEmit` clean, web ESLint **0 errors / 0 warnings**, `next build` passes.

### Foundation (additive)

- `**lib/http/api-client.ts`** — typed same-origin client for `/api/*` (`ApiError`, `get/post/put/patch/delete`, `credentials: include`, 204-safe body parsing, optional DELETE body). Mailops stays separate (`lib/queue/queue-api-client.ts`).
- `**lib/query/keys.ts**` — hierarchical `qk` factory (contacts, lists, sequences, templates, mailboxes, timeline, drafts, users) for targeted + broad invalidation.
- `**providers/query-provider.tsx**` — `QueryClient` in a `useState` initializer (one per browser) with defaults (`staleTime 30s`, `retry 1`, `refetchOnWindowFocus false`).
- `**components/shared/query-state.tsx**` — `<QueryState>` render-prop wrapper standardizing loading / error / empty UX.

### Hooks (`hooks/queries/`)

Per-resource `useQuery` + `useMutation` hooks with `onSuccess` invalidation: contacts (incl. batch + search), lists (incl. add/remove contacts), sequences (detail `initialData`-hydratable, create/delete/duplicate/control/launch/reset/settings + optimistic patch), sequence-steps (reorder is optimistic w/ rollback), sequence-contacts, sequence-lists, templates, mailboxes (incl. aliases refresh), timeline (paginated + infinite), drafts.

### `sequence-context` (Step 6 — deviation noted)

The plan said *delete* `lib/sequence-context.tsx`. Instead it was **rewritten in place** to be react-query-backed while preserving the `SequenceProvider` / `useSequence()` export surface — so all 9 consumers (header, launch modal, lists, contacts, setup-checklist, email-settings, business-hours-settings, add-sequence-step, the layout) compile and behave identically with **zero call-site churn**. `useSequence()` reads the id from context; `useSequence(id)` overload supports out-of-provider use. The dead try/catch in `add-to-sequence-modal.tsx` (rendered outside the provider on the contacts page) was removed — the variable it captured was never used.

### Components & pages migrated (Step 4 + 4b)

All worst offenders + ~40 more: sequence-overview (10 fetches → 1 query + mutations), sequence-contacts (polling via `refetchInterval`), sequence-lists, list-details-view (`useParams` replaces `window.location.pathname` parsing), contact-list, add-to-sequence-modal, email-composer, sequence/table/list/controls/danger-zone/settings/analytics, all template components, all list components + the `[id]` page, search (GlobalSearch, dropdowns, Apollo, the search page), mailboxes section + add-mailbox, timeline (list/infinite/recent/page-client/section — export stays a direct fetch since it returns a CSV blob), onboarding (container + 3 steps, now `"use client"`), settings (profile/email), admin users, dev TestDataManager, both editors. Two superseded hand-rolled hooks (`hooks/use-sequences.ts`, `hooks/use-sequence-steps.ts`) deleted.

### ⚠️ Carryover (your smoke-tests)

1. **Visual smoke** the migrated flows: sequence step reorder (optimistic, should snap on drop), add/remove contact (list refreshes without reload), add-to-list 409 "already in list" path, timeline pagination + infinite scroll, mailbox aliases refresh.
2. `**react-query` cache sanity** — add `<ReactQueryDevtools/>` temporarily and confirm queries dedupe (one request per key with multiple subscribers) and invalidate after mutations.
3. **No behavior change intended** — every toast message and loading state was preserved. The one semantic fix: `template-selector` / `sequence-list-selector` previously treated the paginated `{templates}`/`{lists}` object as a bare array (showed nothing); they now read `data.templates`/`data.lists` correctly.

---

## 🔴 Blocked on YOU (operational / destructive — do before deploying)

Full detail in `../HANDOFF.md`. Summary:

1. **Generate `SERVICE_INTERNAL_TOKEN*`* and set it in both apps (REQUIRED to boot). `openssl rand -hex 32`.
2. **Rotate secret VALUES (plan 02a)** — the on-disk `.env.production`/`.env.extra` files were never committed to git (history audit clean), but the real values live on disk. Rotate at your discretion: production DB password, `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`, Google OAuth client secrets (resetting invalidates existing refresh tokens), service-account key, Apollo/DeepSeek API keys, `PUBSUB_VERIFICATION_TOKEN`, `CRON_SECRET`.
3. **Activate token-at-rest encryption (plan 02b)** — code is deployed. To finish:
  - Run `DATABASE_URL=… node --import tsx packages/database/scripts/wipe-oauth-tokens.ts` (first with `DRY_RUN=1` to preview, then `DRY_RUN=0` to wipe plaintext tokens).
  - Re-authenticate Gmail. New tokens are stored AES-256-GCM encrypted.
  - To later verify: `SELECT access_token FROM "Mailbox" LIMIT 5;` should show `enc1:…` strings, not `ya29.…`.
4. **DB migrations (plan 06)** — **DEFERRED to the very end** (owner decision). Will be picked up once everything else is satisfactory. Needs a DB backup + staging before any destructive work:
  - Add missing indexes (`Session.userId`, `Template.userId`, `Draft.contactId`/`templateId`, `EmailEvent.contactId`/`sequenceId`), explicit cascade policy, optional soft-deletes.

---

## 📘 Plan 02 — operator runbook (code is DONE, you run these)

Plan 02 is **code-complete**; nothing more to write. These are the manual operator steps you must run for it to take effect. (Two parts: **02a** = rotate secret values; **02b** = activate token-at-rest encryption.)

### 02a — rotate secret values (discretionary)

The on-disk `.env.production` / `.env.extra` files were never committed (git history audit = clean), but the real values still live on disk. Rotate at your discretion:

- production DB password
- `NEXTAUTH_SECRET`
- `ENCRYPTION_KEY` (rotation needs the dual-key path — set the old value as `ENCRYPTION_KEY_OLD` first, then deploy the new `ENCRYPTION_KEY`; the decrypt layer reads `ENCRYPTION_KEY_OLD` for legacy ciphertext)
- Google OAuth client secrets (resetting these **invalidates existing refresh tokens** — coordinate with 02b's re-login)
- service-account key, Apollo/DeepSeek API keys, `PUBSUB_VERIFICATION_TOKEN`, `CRON_SECRET`

### 02b — activate OAuth token-at-rest encryption (REQUIRED for the security fix to actually protect tokens)

Code path: AES-256-GCM field crypto + Prisma `$extends` encrypt-on-write / decrypt-on-read on `Mailbox` / `Account` token fields; wipe script written. To finish:

1. **Preview the wipe** (no changes): `DATABASE_URL=… node --import tsx packages/database/scripts/wipe-oauth-tokens.ts` with `DRY_RUN=1` (the default).
2. **Run the wipe** for real: `DRY_RUN=0 node --import tsx packages/database/scripts/wipe-oauth-tokens.ts`. Plaintext tokens are blanked.
3. **Re-authenticate Gmail** so fresh tokens are written through the encrypt-on-write hook.
4. **Verify**: `SELECT access_token FROM "Mailbox" LIMIT 5;` should now show `enc1:…` ciphertext, not `ya29.…`.

> ⚠️ Edge-runtime note (already fixed): plan 02b's `$extends` hook imports Node's `crypto`, which is unavailable in the Next.js Edge Runtime. `apps/web/middleware.ts` therefore runs on the Node.js runtime (`export const runtime = "nodejs"`). If you ever move the onboarding check out of middleware, you can drop that.

---

## 🟡 Deferred (lower-risk, do later)

- **Plan 06 (DB schema / indexes / cascade / soft-delete):** deliberately deferred to the very end (owner decision). Will be the last refactor to land — needs a DB backup + staging since it's destructive. Not blocking deploy.
- **Plan 12 (testing baseline):** runs right after plan 10. Scaffolding + security regression tests first.
- `**@tiptap/*`** is at v3 and still actively imported by 6 components (`compose`, `sequences`, `templates` via `editor-old/rich-text-editor.tsx`). Plan 11's editor consolidation (Lexical vs TipTap) is still open — migrating those callers to Lexical would let `editor-old/` and the TipTap deps be deleted.

---

## How to continue in a new chat

1. **Branches:** `refactor/old-code-update` (security) is the base; `upgrade/remaining-majors` (deps + plans 13/14) is stacked on top. Merge order: security first, then deps — or merge `upgrade/remaining-majors` directly (it contains both).
2. **Pick up where this left off:**
  - To continue the **security** work: plan 02 is code-done (you just run the wipe + re-login + rotate values — see "Plan 02 — operator runbook" below). Plan 06 (DB schema) is **deferred to the very end** (owner decision).
  - To continue **quality** work: **plan 10 (BullMQ resilience)** is code-done and awaiting smoke-test. Then **plan 12 (testing)**. Plans 07, 08, 13, and 14 are fully done.
  - **Plans 13 + 14 are done** — monorepo scripts cleaned up, shared config centralized, `@coldjot/ui` extracted with Base UI + sonner.
3. **Read first:** `00-overview.md` for the full audit, then the specific plan doc. Each plan doc is self-contained with file:line refs and verification checklists.
4. **Verify before merging:** `npm run typecheck` + `npm run lint` + `npm run build`; smoke-test the auth boundary (401 without token), IDOR (403/404 cross-tenant), tracking (event recorded), and the UI (Sheets, Dialogs, Tooltips, Selects, dark mode toggle).

---

## ✅ Plan 13 — Monorepo scripts, Turbo & dev-experience cleanup — DONE

Committed `945b08c` + `3d9969b` on `upgrade/remaining-majors`.

**Root scripts fixed (was partly broken):**
- `build` was a no-op (`turbo run build:development` — no package defined it) → now `turbo run build`.
- `start` was a no-op → now `turbo run start`.
- `db:migrate`/`db:push`/`db:reset` ran `dotenv -e .env` against a nonexistent root `.env` → now delegate to the `@coldjot/database` workspace.
- New: `npm run dev` runs web + mailops only; `npm run dev:all` includes package watchers; `npm run typecheck` / `npm run lint` / `npm run clean` aggregates.

**Turbo rewired:** correct `globalEnv`/`globalPassThroughEnv`; `db:deploy` no longer a build side-effect; consistent caching.

**Dead deps removed:** axios, concurrently, nodemon, react-day-picker/react-intersection-observer/@hookform/resolvers (from mailops), fs-extra, dotenv-cli. 6 lint packages moved to devDependencies.

**Env loading unified:** web now uses the same zod-at-runtime pattern as mailops.

**Also fixed:** latent plan-10 DLQ naming bug (`<name>:dl` → `<name>-dl`; BullMQ rejects `:`).

---

## ✅ Plan 14 — Centralize shared config + extract `@coldjot/ui` + Radix→Base UI — DONE

Multiple commits on `upgrade/remaining-majors`.

### Half A — Shared config packages

- **`@coldjot/tsconfig`** — `base.json` / `library.json` / `app.json` presets; all 4 workspace tsconfigs now extend them.
- **`@coldjot/eslint-config`** — `base()` / `next()` / `types()` presets; all 4 workspace eslint configs collapsed to ~3 lines each.
- **Root `.prettierrc.json` + `.prettierignore`** — the `format` script now has an actual config.

### Half B — `@coldjot/ui` design system package

**Architecture (following the official shadcn monorepo sample):**
- Subpath exports: `@coldjot/ui/components/button`, `@coldjot/ui/lib/utils`, `@coldjot/ui/hooks/use-toast`, `@coldjot/ui/globals.css`
- No build step — source consumed directly by apps via `transpilePackages`
- `globals.css` owns everything: `@import "tailwindcss"` + `tw-animate-css` + `shadcn/tailwind.css` + `@source` directives + `@theme inline` + `:root`/`.dark` tokens + base resets
- Apps import via `@import "@coldjot/ui/globals.css"` (clean, no relative paths)

**Theme adopted from shadcn sample:**
- `oklch()` color tokens (light + dark) with your custom blue-gray palette
- Sidebar tokens, chart tokens, expanded radius scale
- `next-themes` for dark mode (class-based, system default, `d` keyboard hotkey + visible sun/moon toggle in sidebar)
- Fonts: Inter (sans) + Geist Mono (mono) via `next/font/google`

**Full Radix UI → Base UI migration:**
- All 37+ components reinstalled from the `base-nova` registry style
- Structural changes: `Overlay→Backdrop`, `Content→Popup`, `Viewport→List`, `Trigger→Tab`, `Portal > Positioner > Popup` for overlays
- `asChild → render` prop throughout
- Data attributes modernized: `data-[state=open] → data-open`, etc.
- All `@radix-ui/*` and `radix-ui` deps removed; `@base-ui/react` is the sole primitive dep
- **Backward-compat shims:** all 5 trigger wrappers + Button + DropdownMenuItem + TooltipProvider accept the old `asChild`/`delayDuration` props and translate internally (so 67 consumer-side `asChild` usages keep working without touching 33+ files)

**Toast → sonner:**
- All 47 files migrated from `react-hot-toast` + `useToast` hook → `sonner`
- `toast({title, description, variant})` → `toast.success/error(title, {description})`
- Removed `react-hot-toast` dependency

**Dark mode fix:**
- 146 hardcoded color classes (`bg-white`, `text-gray-500`, `bg-gray-100`, etc.) replaced with semantic theme tokens (`bg-background`, `text-muted-foreground`, `bg-muted`)
- Eliminated the "half light, half dark" rendering issue

**Verified:** typecheck 9/9, lint 9/9, build OK, zero runtime errors.

### Follow-up — fix hydration/serialization errors from the Base UI migration

After the migration, three classes of runtime/typecheck errors surfaced and were fixed
**without touching any shadcn UI component** (only consumer code in `apps/web`):

1. **Nested-`<button>` hydration errors** — Base UI triggers render a `<button>` by
   default and don't honor Radix's `asChild` (Slot) the same way, so
   `<XTrigger asChild><Button/></XTrigger>` emitted `<button>` inside `<button>`.
   - Wrote `scripts/fix-aschild-triggers.ts` (ts-morph AST codemod) to convert every
     `<XTrigger asChild><Child/></XTrigger>` into the Base UI `render` prop form
     `<XTrigger render={<Child/>}>…</XTrigger>`. **54 auto-transforms across 26 files.**
   - Manually fixed 3 nested-trigger chains (`DialogTrigger > TooltipTrigger > Button`
     in `editor-toolbar.tsx` ×2; `TooltipTrigger > DropdownMenuTrigger > Button` in
     `sequence-table.tsx`) via composed `render` props, plus 1 dynamic-child popover
     trigger (`sequence-list-selector.tsx`).
   - Converted 4 remaining `<Button asChild><Link/a/></Button>` usages to `render`.
   - Codemod is idempotent and re-runnable: `node --experimental-strip-types --no-warnings scripts/fix-aschild-triggers.ts [--dry-run]`.

2. **`MenuGroupContext` missing** — Base UI's `Menu.GroupLabel` (which `DropdownMenuLabel`
   maps to) requires a `Menu.Group` ancestor. Wrapped the Sidebar's label in
   `<DropdownMenuGroup>` (only such usage in the app).

3. **Symbol-property serialization errors** — raw Prisma objects passed Server→Client
   carry non-enumerable/Symbol props (`nodejs.util.inspect.custom`) that React's RSC
   serializer rejects. Added `apps/web/src/lib/serialize.ts` (`toPlain()` helper) and
   applied it at 4 leaking boundaries: `settings/profile`, `compose`,
   `settings/mailboxes`, `sequences/[id]/layout`.

**Theme palette:** `packages/ui/src/styles/globals.css` updated to the slate palette
with a monochromatic blue chart scale (user-selected); `components.json` refreshed from
the latest shadcn restore (style `base-rhea`, baseColor `mist`). No shadcn component
files were modified.

**Verified:** typecheck 9/9, 0 errors.

---

## Quick verification commands (Node 24)

```bash
nvm use 24.18.0
npm install --legacy-peer-deps --ignore-scripts
npm approve-scripts @prisma/client @prisma/engines prisma
npx prisma generate --schema=packages/database/prisma/schema.prisma

# Typecheck (all workspaces via turbo)
npm run typecheck

# Build (all workspaces via turbo)
npm run build

# Lint (all workspaces via turbo)
npm run lint

# Dev (web + mailops in one command)
npm run dev

# Format
npm run format
```

