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

**Totals:** 8 done · 2 awaiting owner action/verification (02, 10) · 2 blocked/deferred (06, 12) · 1 superseded (11) — **0 not started.**

---

> **Last updated:** plan 13 (monorepo scripts/Turbo/dev-experience cleanup) DONE. Plan 10 (BullMQ resilience) committed (`e2e2e77`) and **awaiting owner smoke-testing** — note: plan 13's smoke-test found & fixed a latent plan-10 DLQ naming bug (`<name>:dl` → `<name>-dl`; BullMQ rejects `:`). Plan 06 deferred to the very end. Plan 07 (frontend react-query consolidation) code complete; plan 02 code-done; plan 08 done. This file tracks the 12-plan refactor (`00-overview.md` → `12-testing-strategy.md`) plus plan 13.
> **Two parallel workstreams** live on two branch chains off `master`:
> - **Security/quality refactor** → `refactor/old-code-update` (plans 01, 03, 04, 05, 09, + part of 11)
> - **Dependency modernization + plan 08** → `upgrade/remaining-majors` (built on top of `refactor/old-code-update`; supersedes most of plan 11; also completed plan 08)
>
> Read `../HANDOFF.md` for the deploy-blocking operational items (env tokens, secret rotation, DB migrations).
>
> ## 🔵 Architecture decision — mailops consolidation postponed
> `plans/mailops-consolidation/` was evaluated and **deliberately postponed** (not adopted now; may revisit in the future). Consequences:
> - **Plan 10 (BullMQ resilience) is NOT moot** — it's the next active coding plan. BullMQ stays in production for now, so hardening it (retries, backoff, DLQ, idempotency) is real, valuable work.
> - **Plan 03 (service auth + CORS) stays load-bearing** — the web↔mailops internal auth boundary remains.
> - Do **not** start any consolidation work; revisit the decision later.

---

## Plan-by-plan status

| # | Plan | Status | Where |
|---|---|---|---|
| [01](./01-security-idor-authorization.md) | IDOR + authorization layer | ✅ **DONE** | `refactor/old-code-update` (`fa69382`) |
| [02](./02-security-secrets-credentials.md) | Rotate secrets + encrypt OAuth tokens | 🟢 **CODE DONE — 2 operator steps left** | 02a: git history audited (clean); .gitignore consolidated; boot-time zod validation; Prisma query-logging locked down. 02b: AES-256-GCM field crypto + Prisma `$extends` encrypt-on-write/decrypt-on-read on `Mailbox`/`Account` token fields; wipe script written. **You must:** (1) rotate the actual secret values in their dashboards, (2) run `wipe-oauth-tokens.ts` (DRY_RUN=0) + re-login Gmail so tokens are stored encrypted. `ENCRYPTION_KEY` rotation needs the dual-key path (`ENCRYPTION_KEY_OLD`) |
| [03](./03-security-mailops-auth-cors.md) | Service auth + CORS allowlist | ✅ **DONE** | `refactor/old-code-update` (`fd6c416`) |
| [04](./04-security-input-validation.md) | zod validation across API routes | ✅ **DONE** | `refactor/old-code-update` (`a2629d5`) |
| [05](./05-security-tracking-webhook.md) | Fix no-op tracking + open redirect | ✅ **DONE** | `refactor/old-code-update` (`42941ae`) |
| [06](./06-database-schema.md) | Indexes, cascade/soft-delete, migration hygiene | ⏸️ **DEFERRED — last** | owner decision: do at the very end once everything else is satisfactory. Needs DB backup + staging (destructive) when started. |
| [07](./07-frontend-data-fetching.md) | Consolidate on react-query | ✅ **DONE** | `upgrade/remaining-majors` — see the plan-07 section below. The whole web app now fetches via the typed `api` client + react-query hooks; the hand-rolled `sequence-context` is backed by react-query; ~50 components/pages migrated. `tsc --noEmit` clean, web ESLint 0/0, `next build` passes. |
| [08](./08-frontend-code-quality.md) | Remove console.log/any, dead code, lint | ✅ **DONE** | all `console.log` removed; `any` 76→0; unused-vars 335→0; exhaustive-deps 10→0; duplicated `transformEmailData` extracted; dead toolbar files deleted; stale step-reorder TODO resolved. **All ESLint rules now `error`** (no-explicit-any, no-unused-vars, rules-of-hooks, exhaustive-deps, useless-catch, prefer-const, preserve-caught-error, etc.). Web lint fully clean: 0 errors / 0 warnings |
| [09](./09-backend-logging-pii.md) | Redact PII/tokens from logs | ✅ **DONE** | `refactor/old-code-update` (`70b3b74`); pino call-site refactor + pino 10 in upgrade chain |
| [10](./10-backend-job-resilience.md) | BullMQ retries/backoff/DLQ | 🟡 **CODE DONE — awaiting owner smoke-test** | committed `e2e2e77` on `upgrade/remaining-majors`. Migrations applied to dev DB. Shared retry policy, stall config, DLQ per queue, email idempotency guard, bounded schedule-path failures, Bull-Board at `/admin/queues`. **Before starting plan 12:** smoke-test the resilience paths (see the plan-10 section below) so we know what's working before writing tests around it. |
| [11](./11-tooling-config-dependencies.md) | Align deps, consolidate env, eslint config | ✅ **SUPERSEDED** | fully covered by the dependency-upgrade pass (see below) — every dep is now latest |
| [12](./12-testing-strategy.md) | Testing baseline | ⏸️ **BLOCKED on plan 10 smoke-test** | scaffolding + security regression tests; start only after plan 10 is verified working |
| [13](./13-monorepo-scripts-devexperience.md) | Monorepo scripts, Turbo, dev-experience cleanup | ✅ **DONE** | fixed broken root `dev`/`build`/`start` (no-op `build:development`, `start:dev`); rewrote Turbo config (correct `globalEnv`/`globalPassThroughEnv`, `db:deploy` no longer a build side-effect, consistent caching); removed dead deps (axios, concurrently, nodemon, react-day-picker, react-intersection-observer, @hookform/resolvers in mailops, fs-extra/dotenv-cli) + moved 6 lint/test packages to devDeps + harmonized drift (tsx 4.19, rimraf 6, tsup 8.5); unified env loading (web → mailops zod pattern, deleted `next.config.ts` dotenv ladder); added one-command web+mailops dev (`npm run dev`); added `typecheck`/`lint`/`clean` aggregates + `typecheck` script to web; renamed `type-check`→`typecheck` everywhere; deleted dead `apps/web/.eslintrc.json` + `apps/mailops/nodemon.json`. **Also fixed a latent plan-10 bug found during smoke-test:** DLQ queues were named `<name>:dl` — BullMQ rejects `:` in queue names → mailops crashed on boot; renamed to `<name>-dl`. Verified: `npm run build`/`typecheck`/`lint` all green (7/7 tasks), `npm run dev` boots both apps cleanly. |

---

## ✅ Security/quality refactor — what's done (on `refactor/old-code-update`)

7 commits, each scoped to one plan, each typecheck-clean. Commit hashes changed after a `git filter-repo` history rewrite (the old hashes in `../HANDOFF.md` are stale; use `git log --oneline refactor/old-code-update` for current ones):

| Plan | What landed |
|---|---|
| **01** | Closed IDOR + mass-assignment; added `requireAuth`/`findForeignContactIds`/`isNotFound` helpers; consolidated duplicate Prisma client; fixed broken step-reorder TODO |
| **03** | `requireServiceToken` middleware; gated `/api`, `/api/mailbox`, `/api/lists`; CORS allowlist; fixed PubSub always-200 error handler; web sends `X-Service-Token` everywhere; fixed shadowed `env` export |
| **04** | zod schemas + `parseBody`/`parseQuery`; validation wired into contacts, lists, sequences, steps, launch, drafts, apollo search; clamped pagination |
| **05** | Restored no-op tracking endpoint (proxies to mailops); made `/api/track` public; validated event types; fixed `x-forwarded-for` parsing; safe-redirect + enum validation in mailops |
| **08** *(partial)* | Redacting `logger`; deleted OAuth-token/PII console.logs in Gmail callback/auth routes; cleaned API-route console.logs; removed dead debounce hook + empty `ui/backup` |
| **09** | pino `redact` config; removed SMTP `console.log(token)`; stopped logging `req.headers`/raw PubSub body/full `job.data`/sequence content |
| **11** *(partial)* | Removed accidental `i` + `npm` deps; mailops ESLint config (the rest of 11 is superseded by the upgrade pass) |

---

## ✅ Dependency modernization — DONE (on `upgrade/remaining-majors`)

Built on top of `refactor/old-code-update`. This supersedes plan 11 entirely. **Every dependency is now on the current major + latest minor/patch.** Full plan in `../upgrade/` (README + per-step docs + STATUS).

### What got upgraded
| Package | Was | Now |
|---|---|---|
| Node floor | `>=20` | **`>=24`** (`.nvmrc` → 24.18.0 LTS) |
| `typescript` | 5.x | **6.0.3** |
| `@types/node` | 20.x | **26.x** |
| `zod` | 3.24 | **4.4.3** |
| `eslint` | 8.x | **10.x** (flat config) |
| `tailwindcss` | 3.4 | **4.x** (CSS-first) |
| `express` | 4.21 | **5.2.1** |
| `next` | 15.1 | **16.2.10** (Turbopack) |
| `prisma` / `@prisma/client` | 6.2 | **7.8.0** (driver-adapter model) |
| `react-day-picker` | 8.10 | **10.x** |
| `pino` / `pino-pretty` / `pino-http` | 8 / 10 / 8 | **10 / 13 / 11** |
| `googleapis` | 126/144 | **173** (aligned) |
| `date-fns` | 2.30/4.4 | **4.4** (aligned) |
| `nodemailer` | 6.10 | **9.0.3** |
| `openai` | 4.86 | **6.45** |
| `@lexical/*` + `lexical` | 0.25 | **0.46** |
| `@tiptap/*` | 2.9 | **3.27** |
| `recharts` | 2 | **3** |
| `lucide-react` | 0.456 | **1.23** |
| `react-markdown` | 9 | **10** |
| `react-resizable-panels` | 2 | **4** |
| `uuid` | 11 | **14** |
| `jwks-rsa` | 3 | **4** |
| `dotenv` | 16 | **17** |
| `jest` / `sinon` | 29 / 19 | **30 / 22** |
| `concurrently` / `rimraf` | 8 / 5 | **10 / 6** |
| `react` / `react-dom` | 19.0 | **19.2** |
| `bullmq`, `next-auth@beta`, `tailwind-merge`, `luxon`, `@google-cloud/pubsub` (4→5), `ioredis`, etc. | — | all latest |

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
- **`MAILOPS_PUBSUB_ENABLED`** env flag added (lets dev boot without GCP creds).

### ⚠️ Carryover from the upgrade (your runtime tasks)
1. **Env tokens still required** to boot: `MAILOPS_SERVICE_TOKEN` (web) / `SERVICE_INTERNAL_TOKEN` (mailops) — see `../HANDOFF.md` §1. Set `MAILOPS_PUBSUB_ENABLED=false` in mailops dev env to skip PubSub.
2. **Visual smoke needed** for API-changing steps: react-resizable-panels v4 (`data-panel-group-direction` selector may need verifying), recharts v3, lucide v1, the Lexical editor.
3. **`prisma.config.ts`** now provides the migration URL (Prisma 7 removed `url` from schema). No destructive migrations were applied.

---

## ✅ Plan 08 — frontend code quality — DONE (on `upgrade/remaining-majors`)

Completed in 6 commits (`bb50c78` → `33d4111`). The web app's ESLint now reports **0 errors / 0 warnings**.

### What got done
| Area | Before | After |
|---|---|---|
| Debug `console.log` in web src | ~93 | **0** |
| `@typescript-eslint/no-explicit-any` | 76 | **0** |
| `@typescript-eslint/no-unused-vars` | 335 | **0** |
| `react-hooks/exhaustive-deps` | 10 | **0** |
| Total ESLint warnings (web) | 439 | **0** |

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
- **`lib/http/api-client.ts`** — typed same-origin client for `/api/*` (`ApiError`, `get/post/put/patch/delete`, `credentials: include`, 204-safe body parsing, optional DELETE body). Mailops stays separate (`lib/queue/queue-api-client.ts`).
- **`lib/query/keys.ts`** — hierarchical `qk` factory (contacts, lists, sequences, templates, mailboxes, timeline, drafts, users) for targeted + broad invalidation.
- **`providers/query-provider.tsx`** — `QueryClient` in a `useState` initializer (one per browser) with defaults (`staleTime 30s`, `retry 1`, `refetchOnWindowFocus false`).
- **`components/shared/query-state.tsx`** — `<QueryState>` render-prop wrapper standardizing loading / error / empty UX.

### Hooks (`hooks/queries/`)
Per-resource `useQuery` + `useMutation` hooks with `onSuccess` invalidation: contacts (incl. batch + search), lists (incl. add/remove contacts), sequences (detail `initialData`-hydratable, create/delete/duplicate/control/launch/reset/settings + optimistic patch), sequence-steps (reorder is optimistic w/ rollback), sequence-contacts, sequence-lists, templates, mailboxes (incl. aliases refresh), timeline (paginated + infinite), drafts.

### `sequence-context` (Step 6 — deviation noted)
The plan said *delete* `lib/sequence-context.tsx`. Instead it was **rewritten in place** to be react-query-backed while preserving the `SequenceProvider` / `useSequence()` export surface — so all 9 consumers (header, launch modal, lists, contacts, setup-checklist, email-settings, business-hours-settings, add-sequence-step, the layout) compile and behave identically with **zero call-site churn**. `useSequence()` reads the id from context; `useSequence(id)` overload supports out-of-provider use. The dead try/catch in `add-to-sequence-modal.tsx` (rendered outside the provider on the contacts page) was removed — the variable it captured was never used.

### Components & pages migrated (Step 4 + 4b)
All worst offenders + ~40 more: sequence-overview (10 fetches → 1 query + mutations), sequence-contacts (polling via `refetchInterval`), sequence-lists, list-details-view (`useParams` replaces `window.location.pathname` parsing), contact-list, add-to-sequence-modal, email-composer, sequence/table/list/controls/danger-zone/settings/analytics, all template components, all list components + the `[id]` page, search (GlobalSearch, dropdowns, Apollo, the search page), mailboxes section + add-mailbox, timeline (list/infinite/recent/page-client/section — export stays a direct fetch since it returns a CSV blob), onboarding (container + 3 steps, now `"use client"`), settings (profile/email), admin users, dev TestDataManager, both editors. Two superseded hand-rolled hooks (`hooks/use-sequences.ts`, `hooks/use-sequence-steps.ts`) deleted.

### ⚠️ Carryover (your smoke-tests)
1. **Visual smoke** the migrated flows: sequence step reorder (optimistic, should snap on drop), add/remove contact (list refreshes without reload), add-to-list 409 "already in list" path, timeline pagination + infinite scroll, mailbox aliases refresh.
2. **`react-query` cache sanity** — add `<ReactQueryDevtools/>` temporarily and confirm queries dedupe (one request per key with multiple subscribers) and invalidate after mutations.
3. **No behavior change intended** — every toast message and loading state was preserved. The one semantic fix: `template-selector` / `sequence-list-selector` previously treated the paginated `{templates}`/`{lists}` object as a bare array (showed nothing); they now read `data.templates`/`data.lists` correctly.

---

## 🟡 Plan 10 — backend job resilience — CODE DONE, AWAITING SMOKE-TEST (on `upgrade/remaining-majors`, commit `e2e2e77`)

Hardened the BullMQ job system so transient failures no longer drop emails or loop forever. `tsc --noEmit` clean, mailops ESLint **0 errors / 0 warnings**, `tsup` build passes. **Both additive migrations have been applied to the dev DB.** Code is committed but **NOT yet verified by manual smoke-testing** — plan 12 (testing) is intentionally blocked until the owner confirms what's actually working. Report bugs/findings back so they can be fixed before tests are written around this behavior.

### What got done
- **Shared policy module** (`apps/mailops/src/config/queue/policy.ts`): one source of truth for `JOB_RETRY` (5 attempts, exponential 5s backoff), `JOB_DEFAULTS` (retention), `STALL_POLICY` (30s check / `maxStalledCount: 1` / 60s lock), and the schedule-path cap `SCHEDULE_MAX_FAILURES: 5`.
- **Enqueue policy** (`job-manager.ts`): `addSequenceJob` / `addEmailJob` now pass `…JOB_DEFAULTS, attempts, backoff`. Removed the per-add retention overrides that were silently narrowing retention.
- **Bug fix:** `addEmailJob`'s computed `delay` was commented out — scheduled emails fired immediately. Uncommented (guarded by the existing `Math.max(0,…)`).
- **Stall handling** (`base-processor.ts`): `Worker` now sets `stalledInterval` / `maxStalledCount` / `lockDuration`. `onStalled` logs at `error`. A stalled job is moved to failed (then to the DLQ) instead of being lost.
- **Dead-letter queue** (`base-processor.ts` + `service-manager.ts`): when a job exhausts retries it's copied to its paired `<name>:dl` queue. Service manager constructs + closes a DLQ per primary queue and exposes `getDlQueue` / `getAllQueues` / `getAllDlQueues`.
- **Email idempotency** (`email/processor.ts` + `lib/tracking/index.ts`): before sending, checks `EmailTracking` for an existing `sent` row with the same `jobId`; if present, skips. New `EmailTracking.jobId` column (indexed) stamps the BullMQ job id at tracking-create time. Resolves the long-standing `TODO` at processor L65. Defense-in-depth: the existing bounce/reply guard is kept.
- **Bounded schedule failures** (`schedule/processor.ts`): the ScheduleProcessor sends emails *inline* (not via the EMAIL queue), so BullMQ attempts don't apply — added a `failureCount` + `lastError` on `SequenceContact`. On error: increment; at `SCHEDULE_MAX_FAILURES` set `status = "failed"` + clear `nextScheduledAt` (stops the poller loop, surfaces in UI); otherwise reschedule with the existing 5-min backoff. This is the most user-visible fix — permanently-failing contacts no longer loop silently.
- **Bull-Board** re-installed (`@bull-board/api` + `@bull-board/express` @ ^8.0.2) and mounted at `/admin/queues` behind the existing `requireServiceToken` middleware (plan 03). Mount helper: `apps/mailops/src/lib/bull-board/index.ts`. Shows every primary queue + its DLQ.
- **Retry consolidation:** the two ad-hoc retry paths now read the shared ceiling — `PUBSUB_CONFIG.MAX_RETRIES` and `refreshAccessToken`'s default both reference `JOB_RETRY.attempts`.
- **`--expose-gc` kept** — confirmed genuinely used by `memory/monitor.ts` (`global.gc()`); the plan doc's "remove if unused" didn't apply.

### ⚠️ Smoke-tests for the owner (do these before plan 12)
1. ~~**Apply the two migrations**~~ — DONE, applied to the dev DB. (For other envs: `prisma migrate deploy` from `packages/database`. Both are additive/nullable — zero downtime.)
   - `20260703223316_add_email_tracking_jobid` — `EmailTracking.jobId` + index.
   - `20260703223317_add_sequence_contact_failure_tracking` — `SequenceContact.failureCount` (default 0) + `lastError`.
2. **Smoke-test the resilience paths** (these are the behaviors plan 12 will eventually encode as tests — verify them first):
   - Temporarily throw in `email/processor.ts` for the first 2 attempts → confirm BullMQ retries with exponential backoff and succeeds on the 3rd.
   - Force a 5x failure → confirm the job lands in `<name>-dl` (renamed from `<name>:dl` — BullMQ rejects `:` in queue names; the fix landed with plan 13) and is visible in Bull-Board at `/admin/queues` (with `X-Service-Token`).
   - Re-enqueue a sent email job → confirm it's skipped (idempotency), no double send.
   - Force a permanent failure in the schedule path → confirm `SequenceContact.status = "failed"` and `nextScheduledAt = null` (stops looping).
   - Confirm a scheduled email now waits until `scheduledTime` (delay bug fixed) — the "⏰ Email job scheduled" log should show the delay and the job should be `delayed`, not immediately `active`.
3. **Bull-Board auth:** it's gated by `SERVICE_INTERNAL_TOKEN` (the same token web→mailops uses). Decide whether that's the long-term auth you want for an admin UI vs. a dedicated admin auth.

### Risks & rollback
- Retries amplify load during an outage — exponential backoff + existing per-queue `limiter` (`max`/`duration`) cap throughput.
- `maxStalledCount: 1` could fail a genuinely-slow job; `lockDuration: 60s` exceeds any normal email send.
- **Migrations are additive** → trivial rollback (`DROP COLUMN`).
- **Idempotency guard** adds one indexed `findFirst` per send — cheap.
- **Rollback:** revert the policy (set `attempts: 1`); DLQ + Bull-Board are additive; drop the two columns to revert schema.

---



## 🔴 Blocked on YOU (operational / destructive — do before deploying)

Full detail in `../HANDOFF.md`. Summary:

1. **Generate `SERVICE_INTERNAL_TOKEN`** and set it in both apps (REQUIRED to boot). `openssl rand -hex 32`.
2. **Rotate secret VALUES (plan 02a)** — the on-disk `.env.production`/`.env.extra` files were never committed to git (history audit clean), but the real values live on disk. Rotate at your discretion: production DB password, `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`, Google OAuth client secrets (resetting invalidates existing refresh tokens), service-account key, Apollo/DeepSeek API keys, `PUBSUB_VERIFICATION_TOKEN`, `CRON_SECRET`.
3. **Activate token-at-rest encryption (plan 02b)** — code is deployed. To finish:
   - Run `DATABASE_URL=… node --import tsx packages/database/scripts/wipe-oauth-tokens.ts` (first with `DRY_RUN=1` to preview, then `DRY_RUN=0` to wipe plaintext tokens).
   - Re-authenticate Gmail. New tokens are stored AES-256-GCM encrypted.
   - To later verify: `SELECT access_token FROM "Mailbox" LIMIT 5;` should show `enc1:…` strings, not `ya29.…`.
4. **DB migrations (plan 06)** — **DEFERRED to the very end** (owner decision). Will be picked up once everything else is satisfactory. Needs a DB backup + staging before any destructive work:
   - Add missing indexes (`Session.userId`, `Template.userId`, `Draft.contactId`/`templateId`, `EmailEvent.contactId`/`sequenceId`), explicit cascade policy, optional soft-deletes.
5. **Plan 10 migrations** — code is deployed; migrations applied to dev. For other envs: **apply the two additive migrations** (after a backup): `prisma migrate deploy` from `packages/database`. `20260703223316_add_email_tracking_jobid` (`EmailTracking.jobId` + index), `20260703223317_add_sequence_contact_failure_tracking` (`SequenceContact.failureCount` default 0 + `lastError`). Both are additive/nullable — zero downtime.
6. **Plan 10 smoke-test** — the resilience behavior (retries, DLQ, idempotency, schedule bounds, Bull-Board, delay bug fix) is **not yet manually verified**. See the plan-10 section below for the checklist. Plan 12 (testing) is blocked on this — we shouldn't write tests around behavior that hasn't been confirmed working.

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
- **`@tiptap/*`** is at v3 and still actively imported by 6 components (`compose`, `sequences`, `templates` via `editor-old/rich-text-editor.tsx`). Plan 11's editor consolidation (Lexical vs TipTap) is still open — migrating those callers to Lexical would let `editor-old/` and the TipTap deps be deleted.

---

## How to continue in a new chat

1. **Branches:** `refactor/old-code-update` (security) is the base; `upgrade/remaining-majors` (deps) is stacked on top. Merge order: security first, then deps — or merge `upgrade/remaining-majors` directly (it contains both).
2. **Pick up where this left off:**
   - To continue the **security** work: plan 02 is code-done (you just run the wipe + re-login + rotate values — see "Plan 02 — operator runbook" below). Plan 06 (DB schema) is **deferred to the very end** (owner decision).
   - To continue **quality** work: **plan 12 (testing baseline) is next** — BUT it's blocked until you smoke-test plan 10 (see the plan-10 section below). Once you confirm what's working, plan 12 starts with scaffolding + security regression tests. Plans 07, 08, and 10 (code) are done.
   - **Plan 07 is done** — see the plan-07 completion section below for what landed and the carryover smoke-tests.
3. **Read first:** `00-overview.md` for the full audit, then the specific plan doc. Each plan doc is self-contained with file:line refs and verification checklists.
4. **Verify before merging:** `tsc --noEmit` + `npm run build` in both apps; smoke-test the auth boundary (401 without token), IDOR (403/404 cross-tenant), and tracking (event recorded).

## Quick verification commands (Node 24)

```bash
nvm use 24.18.0
npm install --legacy-peer-deps --ignore-scripts
npm approve-scripts @prisma/client @prisma/engines prisma
npx prisma generate --schema=packages/database/prisma/schema.prisma

# Typecheck
(cd packages/types && npx tsc --noEmit)
(cd packages/database && npx tsc --noEmit)
(cd apps/mailops && npx tsc --noEmit)
(cd apps/web && npx tsc --noEmit)

# Build per-package (the root `npm run build` runs `turbo run build:development`,
# which no package defines — a separate turbo-config gap. Build workspaces directly:)
(cd packages/types && npm run build)        # DTS build fixed (ignoreDeprecations)
(cd packages/database && npm run build)
(cd apps/mailops && npm run build)
(cd apps/web && MAILOPS_SERVICE_TOKEN=<token> APP_ENV=development npx next build)

# Lint (web is now fully clean: 0 errors / 0 warnings; mailops clean)
(cd apps/web && npx eslint .)
(cd apps/mailops && npx eslint .)
```
