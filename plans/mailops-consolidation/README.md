# Mailops Consolidation Plan

> **Standalone architectural plan** — separate from `plans/refactor-plan/` (the security/quality audit). This one evaluates a single question: should ColdJot keep running two apps (`apps/web` + `apps/mailops`), or fold mailops's responsibilities into the Next.js app?

## Read this first

- **[`plan.md`](./plan.md)** — the full analysis and implementation guide.

## TL;DR

**Yes, consolidate — for your self-hosted, cold-email setup.** The bulk of mailops is HTTP routes that become Next.js API routes almost verbatim, and the email scheduler is *already* "poll Postgres at intervals" (it's a BullMQ repeating job that queries `nextScheduledAt`). Replace BullMQ with the database + a 60-second cron tick, delete the entire `apps/mailops` app, and you get:

- One app, one deploy, one set of env vars
- No internal auth boundary to secure (makes `plans/refactor-plan/03` moot)
- No BullMQ/Bull infrastructure to operate (makes `plans/refactor-plan/10` moot)
- `npm run dev` starts everything

The only real loss is BullMQ's exact-delay delivery and built-in retries — both replaceable with ~30 lines of `retryCount` / `nextRetryAt` columns and a backoff helper.

## Three options compared in the plan

| Option | What | Pick when |
|---|---|---|
| **A (recommended)** | Full consolidation. DB-as-queue + cron. Delete mailops. | Self-hosted, cold-email volume, OK with ~1-min jitter |
| B | Routes → Next.js, keep a tiny BullMQ worker | Nervous about losing retries / high volume |
| C | Replace BullMQ with a managed queue (Inngest / Trigger.dev / QStash) | Planning to move to Vercel/serverless |

## Relationship to the refactor-plan folder

This plan is **optional and architectural**. It does not fix a bug. If you adopt it, do so *after* the security fixes in `plans/refactor-plan/01`, `02`, and `05` land, and *before* investing in `plans/refactor-plan/10` (which would otherwise harden a BullMQ setup you're about to delete).

See `plans/refactor-plan/00-overview.md` for the full execution sequence.
