# Step 7 — `upgrade/smtp-ai-minors` (cross-app alignment + remaining minors)

> Branch: `upgrade/smtp-ai-minors` off the merged `upgrade/prisma-7`.
> Final cleanup step: align shared deps between apps and bump remaining libraries to latest within their (now-current) majors.

## Goal
Resolve the cross-app version drift flagged in Plan 11 §2 and catch any remaining libraries not covered by Steps 0–6.

## Changes

### 1. `googleapis` — align both apps
- `apps/web/package.json`: `^144.0.0` → latest (currently **173.0.0**)
- `apps/mailops/package.json`: `^126.0.1` → latest (**173.0.0**), matching web
- Audit both apps' googleapis usage (Gmail API, OAuth, PubSub service-account) for API changes between 126/144 and 173. The Gmail client surface (`gmail.users.messages.send`, `gmail.users.watch`) has been stable; verify `google.auth` JWT/OAuth2 still construct the same way.

### 2. `pino` / `pino-pretty` / `pino-http` — align both apps
- `apps/web`: `pino` `^8.17.0`, `pino-pretty` `^10.3.0` → latest (**pino 10.3.1**, **pino-pretty 13.1.3**)
- `apps/mailops`: `pino` `^8.21.0`, `pino-pretty` `^10.3.1`, `pino-http` `^8.5.1` → latest (match web)
- Pino 9 → 10 is a minor; verify the redact config (added in commit `7e37086` for PII) still works.

### 3. `date-fns` — align mailops to v4 (web is already on v4)
- `apps/mailops/package.json`: `date-fns` `^2.30.0` → `^4.4.0` (matching web)
- **Blast radius is tiny**: mailops uses `date-fns` in exactly **one** place — `apps/mailops/src/lib/log/file-logger.ts:3` (`format(targetDate, "yyyy-MM-dd")`). The `format` named import is unchanged between v2 and v4. No other date-fns functions are used in mailops (timezones use luxon).
- `date-fns-tz` was already removed in Step 0 (unused).

### 4. `nodemailer` / `openai` minors (web + mailops)
- `nodemailer` `^6.9.16` → latest 6.x (don't cross to 7 here unless trivial — nodemailer 7 is a minor change but verify SMTP transport surface).
- `openai` `^4.86.0` → latest 4.x (DeepSeek-compatible). Don't cross to 5 without checking the DeepSeek base-URL override still works.

### 5. Remaining patch/minor sweeps
Run `npm update` at the root to pull the latest patches for everything not already bumped:
- `@tanstack/react-query`, `framer-motion`, `@radix-ui/*`, `lucide-react`, `recharts`, `cmdk`, `vaul`, `@hello-pangea/dnd`, `react-day-picker`, `react-hot-toast`, `react-markdown`, `react-resizable-panels`, `ua-parser-js`, `use-debounce`, `uuid`, `nanoid`, `ioredis`, `jsonwebtoken`, `jwks-rsa`, `@google-cloud/pubsub`, `cors`, `exponential-backoff`, `class-variance-authority`, `clsx`, `axios`, `dotenv`, `geist`, `js-base64`, `lodash`, `papaparse`, `quoted-printable`, `@lexical/*`, `@tiptap/*`, `next-auth`, `tsup`, `turbo`, `tsx`, `ts-node`, `rimraf`, `prettier`, `dotenv-cli`

### 6. Final depcheck
```bash
npx depcheck
```
Review flagged unused deps. **Don't trust depcheck blindly** (false positives for dynamically-imported modules like BullMQ workers, `next-auth` providers). Confirm each before removing.

## Verification
1. `npm install` succeeds (lockfile fully refreshed).
2. `tsc --noEmit` passes in all four packages.
3. `npm run build` succeeds for both apps.
4. `npm run lint` passes.
5. **Runtime smoke (focus on the aligned deps):**
   - Send a test email via the Gmail API path (exercises googleapis + nodemailer).
   - Verify logs still redact PII correctly (pino 10) — check a log line that would contain a token/PII.
   - Trigger the DeepSeek/openai path (if reachable in dev) — verify the AI endpoint still responds.
   - Boot both apps; general smoke.

## Risks & rollback
- **googleapis 126 → 173** is the biggest jump here (47 minor versions). The auth/Gmail surface is stable, but verify the service-account JWT construction in mailops (`google-account.ts`) still works.
- **pino 8 → 10** could change transport/redact APIs — verify the redact paths.
- **date-fns 2 → 4** in mailops is genuinely one-liner (single `format` call) — low risk.
- Rollback: per-package revert; `npm install` restores prior versions.

## Done!
After this step, every dependency is on its current major + latest minor/patch. Update `../HANDoff.md` with the final state and the full list of branches to merge.
