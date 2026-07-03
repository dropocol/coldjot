# ColdJot Refactor Plan — Master Overview

> **Audience:** An implementing model/engineer. Each sub-plan in this folder is self-contained and can be picked up independently unless a "Depends on" note says otherwise.
>
> **Audit scope:** Full monorepo — `apps/web` (Next.js 15 frontend), `apps/mailops` (Express + BullMQ backend), `packages/database` (Prisma), `packages/types`. Audit performed June 2026 against the `master` branch (commit `74fd897`).

---

## TL;DR

ColdJot is a feature-rich cold-email outreach platform with a Next.js + NextAuth frontend, an Express/BullMQ mail-processing backend, Prisma/Postgres, and Gmail OAuth integration. The product surface is broad and largely functional, but the audit surfaced a **cluster of security vulnerabilities** that should be addressed before any further feature work or production hardening:

1. **Plaintext OAuth tokens** stored in the database (`Mailbox`, `Account`).
2. **Production DB password + other production secrets sitting on disk** in `env/.env.production` files (gitignored, but present — needs rotation + scrub).
3. **Insecure Direct Object References (IDOR)** in ~5 web API routes — any authenticated user can read/attach another tenant's contacts, lists, and sequence enrollments by changing an ID.
4. **No authentication on the mailops backend** — every `/api/*` route trusts a client-supplied `userId` from the request body. Anyone who can reach port 3001 can launch/pause/reset anyone's sequences or arm Gmail watches on arbitrary mailboxes.
5. **Open redirect + unauthenticated analytics writes** in the tracking endpoints.
6. **Mass-assignment** in one step-update route (raw JSON body spread into a Prisma `update`).
7. **Email tracking endpoint is a no-op** (the recording logic is commented out) **and** logs PII.

Beyond security, there are substantial **maintainability and architecture** issues:

- **Three competing data-fetching strategies** in the frontend (raw `fetch`, react-query, server actions) — react-query is wired up globally but used in only ~3 files.
- **138 `console.log` statements** (341 total `console.*`) across the web app, including OAuth tokens and PII in the Gmail callback.
- **`any` typed everywhere** (73 occurrences in web, 37 in mailops); core ESLint safety rules (`no-explicit-any`, `exhaustive-deps`, `rules-of-hooks`, `prefer-const`) are **turned off**.
- **97 Prisma migrations** for 21 models, many generically named / rename-revert churn — drift risk.
- **No BullMQ retry/backoff** configured on workers; failed emails die immediately.
- **Env validation is decorative** — `env.ts` exists but is imported in exactly 1 file; server secrets are read via raw `process.env.X!`.

---

## Repository at a glance

| Area | Stack | File count (TS/TSX) |
|---|---|---|
| `apps/web` | Next.js 15 (App Router), React 19, NextAuth v5 (beta), Tailwind, shadcn/ui, Lexical + TipTap editors | 299 |
| `apps/mailops` | Express 4, BullMQ + Bull, ioredis, googleapis, pino | 78 |
| `packages/database` | Prisma, Postgres 17, 21 models, 97 migrations | ~1 (src/index.ts) |
| `packages/types` | Shared TS types, tsup | ~10 |

---

## Sub-plan index

Each file below is a standalone, detailed implementation plan with file:line references, concrete code sketches, and a verification checklist. **Work them in priority order.**

| # | Plan | Severity | Effort | Independent? |
|---|---|---|---|---|
| [01](./01-security-idor-authorization.md) | Fix IDOR & add an authorization layer to web API routes | 🔴 CRITICAL | Medium | Yes |
| [02](./02-security-secrets-credentials.md) | Rotate leaked secrets, encrypt stored OAuth tokens | 🔴 CRITICAL | Large | Yes (but do 02a first) |
| [03](./03-security-mailops-auth-cors.md) | Add service auth + CORS allowlist to mailops backend | 🔴 CRITICAL | Medium | Depends on shared `@coldjot/types` for service-token contract |
| [04](./04-security-input-validation.md) | Introduce zod validation across all API routes/server actions | 🔴 HIGH | Medium | Depends on 01 (shared helpers) |
| [05](./05-security-tracking-webhook.md) | Fix the no-op tracking endpoint, open redirect, unauthenticated analytics | 🔴 HIGH | Medium | Yes |
| [06](./06-database-schema.md) | Indexes, cascade/soft-delete policy, migration hygiene | 🟡 MEDIUM | Large | Yes |
| [07](./07-frontend-data-fetching.md) | Consolidate on react-query (or server actions); remove hand-rolled fetch | 🟡 MEDIUM | Large | Yes |
| [08](./08-frontend-code-quality.md) | Remove `console.log`/`any`, delete dead code, fix broken TODOs, lint config | 🟡 MEDIUM | Medium | Yes |
| [09](./09-backend-logging-pii.md) | Redact PII/tokens from logs in mailops + web | 🟡 MEDIUM | Medium | Yes |
| [10](./10-backend-job-resilience.md) | Configure BullMQ retries/backoff/DLQ, fix error-swallowing patterns | 🟡 MEDIUM | Medium | Depends on 09 (shared redaction helpers) |
| [11](./11-tooling-config-dependencies.md) | Align dependency versions, consolidate env access, eslint config | 🟡 MEDIUM | Medium | Yes |
| [12](./12-testing-strategy.md) | Introduce a testing baseline (unit/integration/e2e) | 🟢 LOW | Large | Do last |
| [13](./13-monorepo-scripts-devexperience.md) | Fix broken root scripts, correctly wire Turbo (caching/env/graph), remove dead/misplaced deps, unify env loading, run web+mailops in one command | 🟢 LOW | Medium | Yes — independent of all other plans |

> **Separate plan:** [`../mailops-consolidation/plan.md`](../mailops-consolidation/plan.md) — **(Optional, architectural)** Fold mailops into Next.js: DB-as-queue + cron instead of BullMQ/Express. Deletes an entire app and its auth boundary. If you take this route, plans 03 and 10 become unnecessary. Do it after 01/02/05 land.

---

## Recommended execution order

**Phase 1 — Stop the bleeding (security, ~1–2 days):**
1. `02a` — Rotate the production DB password and any secrets found in on-disk env files **immediately**. This is a 30-minute task but the highest-impact action.
2. `01` — IDOR fixes (add a shared `assertOwned` helper + fix the 5 affected routes).
3. `03` — Lock down mailops with service auth + CORS allowlist.
4. `05` — Fix the tracking endpoint (it's currently a no-op AND insecure).

**Phase 2 — Harden (security, ~2–3 days):**
5. `02b` — Encrypt OAuth tokens at rest (requires a migration + dual-read path).
6. `04` — Add zod validation everywhere (builds on the helpers from `01`).
7. `09` — Redact PII/tokens from logs.

**Phase 3 — Quality & architecture (ongoing):**
8. `06` — Database schema hardening (indexes, soft-deletes, migration cleanup).
9. `10` — Job resilience (BullMQ retries/DLQ).
10. `07` + `08` — Frontend data-fetching + code-quality pass.
11. `11` — Tooling/dependency alignment.
12. `12` — Testing baseline.
13. `13` — Monorepo scripts & dev-experience cleanup (fixes broken `dev`/`build`/`start`, Turbo caching, dead deps, env loading; adds one-command web+mailops dev).

**Phase 4 — Optional architectural simplification:**
13. See the **separate plan** at [`../mailops-consolidation/plan.md`](../mailops-consolidation/plan.md) — decide whether to consolidate mailops into Next.js. This is a big-picture decision (delete a whole app, replace BullMQ with DB+cron), not a bug fix. Read its "Decision checklist" — if you answer yes to all five, it's a major simplification that *makes plans 03 and 10 unnecessary* (no internal auth boundary, no BullMQ to harden). If you go this route, do it after the security plans land but before investing in plan 10.

---

## Cross-cutting conventions to establish (do early)

These appear in multiple sub-plans; settling them once avoids rework:

1. **Shared zod schemas** in `packages/types` (or a new `packages/validation`) — one source of truth for request bodies, reused by web routes, server actions, and mailops validators. See plans 04 and 07.
2. **A `requireAuth()` + `assertOwned()` helper** in `apps/web/src/lib/auth/` — every route starts with `const { userId } = await requireAuth()`. See plan 01.
3. **A service-to-service auth token** (`SERVICE_INTERNAL_TOKEN`) shared by web and mailops via env. See plan 03.
4. **A `createLogger(module)` wrapper** that auto-redacts known-sensitive keys (`access_token`, `refresh_token`, `password`, `email`, `to`, `subject`). See plan 09.
5. **Extend `packages/database/src/index.ts` Prisma logging** to never log at `"query"` level in production. See plan 02 and 06.

---

## Out of scope for this audit

- Performance/load testing (only obvious perf issues flagged in passing).
- UI/UX or accessibility review (a separate `web-design-guidelines` pass would be appropriate).
- Cost analysis of the Apollo API usage.
- Infrastructure/deployment topology beyond docker-compose.

---

## How to use these plans with another model

Each sub-plan is structured as:
- **Problem** — what's wrong, with evidence (file:line).
- **Goal** — the desired end state.
- **Implementation steps** — ordered, concrete, with code sketches.
- **Files to touch** — explicit list.
- **Verification** — how to confirm the fix worked (manual + automated).
- **Risks / rollback** — what could break and how to revert.

When handing a plan to an implementing model, give it the single file plus this `00-overview.md` for context. The plans deliberately avoid assuming work from other plans unless stated under "Depends on".
