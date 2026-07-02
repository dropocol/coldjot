# Step 9 — `upgrade/pino-logging-refactor` (mailops logging calls)

> Branch: `upgrade/pino-logging-refactor` off the merged `upgrade/lib-majors` (Step 8).
> Fix the pre-existing pino logging-call type errors surfaced by the dependency upgrade, then bump pino 9 → 10.

## Why this step exists

During Step 7, typechecking mailops surfaced **94 `TS2769` errors** in logging calls. Investigation confirmed these are **pre-existing** (identical count on the prisma-7 branch) — they were latent and only surfaced when the lockfile regen pulled stricter `@types` for pino. They are not caused by any version bump in this upgrade.

### The pattern that breaks
All 94 sites use the two-arg form:
```ts
logger.warn("Invalid audience URL:", e);          // e is unknown
logger.info("Starting determineEmailSubject", { stepId, ... });
```
Pino's types require either:
- **object-first:** `logger.warn({ err: e }, "Invalid audience URL")` — the idiomatic pino form (metadata object first, message string second), OR
- a single string arg with no second parameter.

Passing an `unknown` or arbitrary object as the **second** arg after a string is rejected.

## Goal
1. Fix all 94 logging call sites to the object-first form.
2. Then bump pino 9 → 10 (latest), pino-pretty 11 → 13, pino-http 10 → 11 (the bumps deferred from Step 7).

## Scope (files, ~20)

Confirmed error sites (run `(cd apps/mailops && npx tsc --noEmit 2>&1 | grep TS2769 | sed 's/(.*//' | sort -u)` for the live list):
- `src/lib/auth/pubsub.ts`
- `src/lib/email-subject.ts`
- `src/lib/email/index.ts`
- `src/lib/google/smtp/nodemailer.ts`
- `src/lib/schedule/helper.ts`
- `src/lib/tracking/index.ts`
- `src/routes/{health,metrics,sequence,tracking}/controller.ts`
- `src/services/core/memory/monitor.ts`
- `src/services/init.ts`
- `src/services/jobs/base-processor.ts`
- `src/services/jobs/{contact,email,list,schedule,sequence,thread-watch}/processor.ts`
- `src/services/monitor/service.ts`
- (likely more — grep the full list at exec)

## Migration pattern (apply per site)

| Before | After |
|---|---|
| `logger.warn("msg", e)` | `logger.warn({ err: e }, "msg")` |
| `logger.info("msg", { a, b })` | `logger.info({ a, b }, "msg")` |
| `logger.error("msg", err, { ctx })` | `logger.error({ err, ctx }, "msg")` |
| `logger.debug("msg", value)` | `logger.debug({ value }, "msg")` |

**Preserve the message string and all metadata fields** — only reorder args so the object is first. This keeps log output identical (pino renders `{...} msg` either way) and silences the type errors.

For string-interpolation messages like `logger.info("Step ${i} done")`, leave as-is (single string arg is fine).

## Verification
1. `tsc --noEmit` in mailops → **0 errors** (the defining success criterion).
2. `npm run build` (tsup) succeeds.
3. `npm run lint` passes.
4. **Runtime:** boot mailops with `LOG_LEVEL=debug`; trigger a sequence launch and a PubSub webhook; verify the structured logs still contain the same fields (trace `stepId`, `threadId`, etc.) — diff a sample log line pre/post.

## Risks & rollback
- **Log-shape drift** is the main risk — consumers of the structured logs (any log aggregator queries) may key on field names. The object-first form uses the **same field names**, just reordered, so output should be identical. Verify with a sample diff.
- The migration is mechanical but voluminous (~94 sites). Do it in one pass with a consistent pattern; review the diff for any call that doesn't fit the standard shapes above.
- Rollback: revert the commit.
