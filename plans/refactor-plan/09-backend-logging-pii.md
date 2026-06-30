# Plan 09 — Redact PII & Tokens from Backend Logs

> **Severity:** 🟡 MEDIUM (some instances are HIGH — token logging is a credential leak)
> **Effort:** Medium (~1 day)
> **Depends on:** Nothing. Produces the shared logger that plan 10 also uses.

---

## Problem

The mailops backend and parts of the web backend log sensitive data to stdout/files. Combined with `LOG_TO_FILE` being an option, these land in persistent log files.

### HIGH-severity instances

| File | Line | What's logged |
|---|---|---|
| `apps/mailops/src/lib/google/smtp/nodemailer.ts` | 37 | `console.log("Refreshed access token:", token)` — **prints the live access token to stdout** |
| `apps/mailops/src/routes/mailbox.ts` | 22–25 | `logger.info({ body: req.body, headers: req.headers })` — **logs all request headers including Authorization/cookies** on the mailbox-watch endpoint |
| `apps/mailops/src/services/jobs/base-processor.ts` | 74–81 | `onFailed` logs the **entire `job.data`** — for the email queue, that's an `EmailJob` with `to`, `subject`, mailbox ids, userId |
| `apps/mailops/src/services/jobs/job-manager.ts` | 50–62 | `addEmailJob` logs the whole job (`logger.info(job)`) including recipient — **on every enqueue** |
| `apps/web/src/app/api/mailboxes/gmail/callback/route.ts` | 122 | `console.log("Tokens:", tokens)` — full OAuth token set (covered in plan 08) |

### MEDIUM-severity instances (content / metadata)

| File | Line | What's logged |
|---|---|---|
| `apps/mailops/src/services/jobs/email/processor.ts` | 58 | `logger.info(data, "📨 Starting to process email job")` — logs full `EmailJob` (incl. subject) at info on **every** email |
| `apps/mailops/src/services/jobs/email/processor.ts` | 253–259 | error catch spreads `...data` into the log object |
| `apps/mailops/src/services/jobs/sequence/processor.ts` | 110 | `logger.info(dbSequence, "🎮 Sequence")` — dumps the entire sequence row (includes step subjects/content via include) |
| `apps/mailops/src/services/jobs/schedule/processor.ts` | 422–424 | logs full step objects including `subject`/`content` |
| `apps/mailops/src/services/jobs/sequence/processor.ts` | 159–164 | logs `sequenceContact.contact.email` on error |
| `apps/mailops/src/services/pubsub/handler.ts` | 822–844 | logs Gmail message metadata (from/subject) |
| `apps/mailops/src/routes/pubsub.ts` | 36, 52 | logs raw PubSub push body (base64 message data) before and after auth |

### LOW-severity (bypasses structured logger)

`apps/mailops/src/lib/google/smtp/gmail.ts` and `apps/mailops/src/lib/google/account/google-account.ts` are full of `console.log`/`console.error` (lines 44, 45, 110, 111, 137–139, 158, 225, 236, 239, 244, 246, 252 in `gmail.ts`; 31, 34, 37, 49–53, 56 in `google-account.ts`). These bypass pino entirely and won't be captured/redacted by structured logging.

### Config issue

`apps/mailops/src/lib/log/index.ts:80–87` supports `LOG_TO_FILE=true`, which writes everything to `apps/mailops/logs/`. Any of the above leaks become persistent on disk.

---

## Goal

1. **No OAuth tokens, refresh tokens, passwords, or API keys** ever appear in logs (stdout or file).
2. **PII** (recipient email, subject line, contact email, message body) is redacted or logged at a level that's off in production.
3. A **single shared logger** with a redaction layer is used everywhere — no raw `console.log` in mailops.
4. File logging, if used, writes to a secured location with appropriate retention.

---

## Implementation steps

### Step 1 — Extend the existing pino logger with a redaction config

The mailops logger (`apps/mailops/src/lib/log/index.ts`) already uses pino. Pino has a built-in `redact` option — use it:

```ts
// apps/mailops/src/lib/log/index.ts
const SENSITIVE_PATHS = [
  "access_token",
  "refresh_token",
  "id_token",
  "token",
  "accessToken",
  "refreshToken",
  "password",
  "secret",
  "authorization",
  "cookie",
  "headers.authorization",
  "headers.cookie",
  "req.headers.authorization",
  "req.headers.cookie",
  // EmailJob PII:
  "to",
  "subject",
  "data.to",
  "data.subject",
  "data.emailOptions.to",
  "*.access_token",
  "*.refresh_token",
  "*.to",
  "*.subject",
];

export const logger = pino({
  level: env.LOG_LEVEL ?? "info",
  redact: {
    paths: SENSITIVE_PATHS,
    censor: "[REDACTED]",
    remove: false,
  },
  // ...existing transport config
});
```

Pino's `redact` supports glob paths (`*.access_token`), which covers nested job data. This single change neutralizes most of the leaks above without touching call sites.

### Step 2 — Delete the explicit token logs

These are explicit `console.log(token)` calls that no redaction config will catch (they're not in an object):

- `apps/mailops/src/lib/google/smtp/nodemailer.ts:37` — delete the line entirely. If you need refresh telemetry, log `logger.debug("Access token refreshed", { expiry: tokenExpiry })` instead.
- `apps/web/src/app/api/mailboxes/gmail/callback/route.ts:122` — delete (plan 08).
- `apps/mailops/src/routes/mailbox.ts:22–25` — remove `headers: req.headers` from the log; at most log `logger.info({ email: req.body.email }, "mailbox watch requested")` (email is operational, not secret).

### Step 3 — Reduce email-job logging volume & content

- `apps/mailops/src/services/jobs/email/processor.ts:58` — change from logging the full `data` at info to:
  ```ts
  logger.info({ jobId: data.id, mailboxId: data.sequenceMailboxId }, "processing email job");
  ```
  Never log `to` or `subject` at info. If you need them for debugging, log at `debug` and only in non-prod.
- `apps/mailops/src/services/jobs/email/processor.ts:253–259` — on error, log job id + error, not `...data`.
- `apps/mailops/src/services/jobs/job-manager.ts:50–62` — same: log `{ jobId, queue }` not the whole job.
- `apps/mailops/src/services/jobs/base-processor.ts:74–81` — in `onFailed`, replace `data: job.data` with `data: { id: job.id, name: job.name }`. (The full payload can still be retrieved from the BullMQ job store if needed for debugging a specific failure.)

### Step 4 — Replace all `console.log`/`console.error` with the logger

In `apps/mailops/src/lib/google/smtp/gmail.ts` and `apps/mailops/src/lib/google/account/google-account.ts`, replace every `console.*` with `logger.debug`/`logger.error`. This routes them through pino (and the redaction config).

> The `google-account.ts` token-refresh path (L49–53, 56) currently logs `err.message`, `err.code`, `err.status`. OAuth errors from `googleapis` generally don't embed the token, but verify by triggering a refresh failure in staging and inspecting the logged object.

### Step 5 — Tighten the log-to-file path

In `apps/mailops/src/lib/log/index.ts`:
- If `LOG_TO_FILE` is on, write to a directory **outside** the app source tree (e.g. `/var/log/coldjot/` or `./logs/` but ensure `.gitignore` covers it — it does, via `**/*.log`).
- Set file permissions to `0o600` (owner read/write only).
- Add log **rotation** (pino-roll or an external `logrotate` config) and a retention policy (e.g. 7 days).
- **Never** enable file logging in production unless the location is encrypted/at rest and access-controlled.

### Step 6 — Share the logger with the web app

The web app's `lib/logger.ts` (from plan 08) should use the same redaction list. Extract the `SENSITIVE_PATHS` array into `packages/types` (or a new tiny `packages/log`) so both apps import the same config.

### Step 7 — Audit with a staging probe

In staging, trigger each of these and inspect the output:
- Send an email → confirm recipient/subject don't appear in logs.
- Force a token refresh failure → confirm no token appears.
- Hit `/api/mailbox/watch` → confirm no Authorization header appears.
- Force an email-job failure → confirm `job.data` isn't dumped.

---

## Files to touch

**Modify:**
- `apps/mailops/src/lib/log/index.ts` (add redact config, file-log hardening)
- `apps/mailops/src/lib/google/smtp/nodemailer.ts` (delete token log)
- `apps/mailops/src/lib/google/smtp/gmail.ts` (console → logger)
- `apps/mailops/src/lib/google/account/google-account.ts` (console → logger)
- `apps/mailops/src/routes/mailbox.ts` (don't log headers)
- `apps/mailops/src/routes/pubsub.ts` (don't log raw body at info)
- `apps/mailops/src/services/jobs/base-processor.ts` (don't log full `job.data`)
- `apps/mailops/src/services/jobs/job-manager.ts` (don't log full job)
- `apps/mailops/src/services/jobs/email/processor.ts` (reduce info logging)
- `apps/mailops/src/services/jobs/sequence/processor.ts` (don't log sequence content)
- `apps/mailops/src/services/jobs/schedule/processor.ts` (don't log step content)
- `apps/mailops/src/services/pubsub/handler.ts` (redact message metadata)
- `apps/web/src/app/api/mailboxes/gmail/callback/route.ts` (delete token logs — overlaps plan 08)

**Create / extract:**
- `packages/types/src/log/redact-paths.ts` (shared redaction list)
- `apps/web/src/lib/logger.ts` (plan 08)

---

## Verification

- Trigger the staging probes in Step 7; confirm no token/PII in stdout or log files.
- `rg -n "console\.(log|error)" apps/mailops/src` returns nothing (everything goes through pino).
- `grep` the staging log file for a known recipient email after a test send — should return zero matches.
- After a deliberate job failure, the BullMQ job store still contains the full payload (for debugging) but the log line does not.

---

## Risks & rollback

- **Over-redaction can hide debugging signal.** If a path is too aggressive (e.g. redacting all `to` fields breaks correlating emails), refine the glob. Prefer redacting the value (`censor: "[REDACTED]"`) over removing the key (`remove: true`) so you can still see the shape.
- **Pino redact only covers logged objects** — explicit `console.log(token)` bypasses it. That's why Step 2 deletes those lines rather than relying on redaction.
- **Performance:** pino's redact is fast (path-based, evaluated once per schema). Negligible overhead.
- **Rollback:** the redaction config is additive; remove the `redact` block to restore raw logging (not recommended).
