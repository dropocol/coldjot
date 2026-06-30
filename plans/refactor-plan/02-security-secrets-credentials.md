# Plan 02 — Rotate Leaked Secrets & Encrypt Stored OAuth Tokens

> **Severity:** 🔴 CRITICAL
> **Effort:** Large (02a is quick, ~30 min; 02b is a real project, ~2–3 days)
> **Depends on:** Nothing for 02a. 02b benefits from plan 06 (migration hygiene) landing around the same time.

This plan has **two halves**. Do them in order.

---

## Part 02a — Rotate Leaked Secrets (DO THIS FIRST)

### Problem

Real production secrets currently sit on disk in env files inside the repo working tree. Although `.gitignore` excludes `apps/*/env/.env.*` (except `.example`), the files are **physically present** and any tool, backup, IDE sync, or accidental `git add -f` exposes them. We must assume compromise-by-default.

Verified present (values redacted here, but they are real in the files):

| File | Secrets present |
|---|---|
| `apps/web/env/.env.production` | `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`, `DATABASE_URL` (prod DB password), `GOOGLE_CLIENT_SECRET`, `GOOGLE_CLIENT_SECRET_EMAIL`, `DEEPSEEK_API_KEY_PROD` |
| `apps/web/env/.env.extra` | `PUBSUB_VERIFICATION_TOKEN`, `CRON_SECRET`, `DATABASE_URL` (raw IP `152.53.82.230:5432`), `APOLLO_API_KEY` |
| `apps/mailops/env/.env.production` | `DATABASE_URL`, `REDIS_PASSWORD`, `GOOGLE_CLIENT_SECRET_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` |
| `packages/database/env/.env.production` | `DATABASE_URL` |
| `packages/database/env/.env.development` | production password reused in dev env |

### Goal

1. **Rotate every secret** that touched disk so the on-disk copies become worthless.
2. **Remove the secret-bearing files from disk** and move all secret delivery to a proper secret manager / environment-variable injection at deploy time.
3. **Confirm** no secret was ever committed to git history.

### Implementation steps

#### Step 1 — Audit git history for accidental commits

```bash
# Check if any secret file was ever tracked (across all branches/tags)
git log --all --full-history -- \
  'apps/web/env/.env.production' \
  'apps/web/env/.env.extra' \
  'apps/mailops/env/.env.production' \
  'packages/database/env/.env.production' \
  'packages/database/env/.env.development'

# Also scan history for the literal secret substrings (grab one from each file first):
git log -p --all -S '<PASTE_A_UNIQUE_SUBSTRING_OF_THE_PROD_DB_PASSWORD_HERE>' | head -50
```

If **any** commit shows up, the secret is in the git object database and must be treated as publicly leaked regardless of rotation — use `git filter-repo` or BFG to purge, then force-push (coordinate with collaborators first).

#### Step 2 — Rotate, in this order (avoid downtime)

1. **Generate replacement secrets** for each:
   - `NEXTAUTH_SECRET`: `openssl rand -base64 32`
   - `ENCRYPTION_KEY`: `openssl rand -base64 32` (see warning in 02b — rotating this requires re-encrypting existing data)
   - Database passwords: generate a new strong password; update Postgres.
   - `GOOGLE_CLIENT_SECRET` / `GOOGLE_CLIENT_SECRET_EMAIL`: rotate via Google Cloud Console → APIs & Services → Credentials → "Reset secret". **Note:** resetting the secret invalidates existing refresh tokens — users will need to re-auth their mailboxes.
   - `APOLLO_API_KEY`, `DEEPSEEK_API_KEY_PROD`: regenerate in their respective dashboards.
   - `PUBSUB_VERIFICATION_TOKEN`, `CRON_SECRET`: regenerate.
   - `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`: re-issue the service account key in Google Cloud (this auto-revokes the old key).
2. **Deploy the new values** to whatever runs production (Vercel env vars, the VPS, etc.) **before** deleting the on-disk files.
3. **Cutover** with a brief maintenance window if needed (DB password + Google secrets are the disruptive ones).
4. **Delete the on-disk secret files**:
   ```bash
   rm apps/web/env/.env.production apps/web/env/.env.extra
   rm apps/mailops/env/.env.production apps/mailops/env/.env.extra
   rm packages/database/env/.env.production packages/database/env/.env.development
   ```
5. **Update `.gitignore`** to be unambiguous (current patterns are scattered). Consolidate to:
   ```gitignore
   # Secrets — never commit
   **/env/.env
   **/env/.env.*
   !**/env/.env.example
   ```
6. **Provide `.env.example` files** with every key listed but empty values, so new developers know what's required.

#### Step 3 — Move secret delivery off disk

Pick one mechanism based on deployment:
- **Vercel (web) + VPS (mailops):** set secrets in the Vercel dashboard; for the VPS use a `.env` file owned by root (`chmod 600`) outside the repo, or `systemd` `EnvironmentFile=`, or a tool like `direnv`/`sops`+`age`.
- **If both run on the VPS:** consider `docker secrets`, or `sops`-encrypted files committed to a *separate private infra repo* (not this one).

#### Step 4 — Add a boot-time secret presence check

In each app's env-validation module (web: `src/env.ts`, mailops: `src/config/env.ts` — see plan 11), extend the zod schema so a missing required secret **crashes at boot** instead of failing later:

```ts
// apps/web/src/env.ts
import { z } from "zod";
const envSchema = z.object({
  NEXTAUTH_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().min(16),
  DATABASE_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CLIENT_ID_EMAIL: z.string().min(1),
  GOOGLE_CLIENT_SECRET_EMAIL: z.string().min(1),
  GOOGLE_REDIRECT_URI_EMAIL: z.string().url(),
  NEXT_PUBLIC_MAILOPS_API_URL: z.string().url(),
  // ...
});
export const env = envSchema.parse(process.env);
```

This catches a missing/empty secret the moment the app starts.

---

## Part 02b — Encrypt OAuth Tokens at Rest

### Problem

OAuth tokens (`access_token`, `refresh_token`, `id_token`) are stored as **plaintext** in two tables:

- `Mailbox` — `packages/database/prisma/schema.prisma:425–431` (fields `access_token`, `refresh_token`, `id_token`, all `@db.Text`)
- `Account` (NextAuth) — `schema.prisma:43–48` (same fields)

Confirmed plaintext at write time: `apps/web/src/app/api/mailboxes/gmail/callback/route.ts:168–169, 192–193` writes `tokens.access_token` / `tokens.refresh_token` directly. Read back in plaintext by both `apps/web` and `apps/mailops` Gmail client code.

An `ENCRYPTION_KEY` already exists and `apps/web/src/lib/crypto.ts` implements AES-256-GCM, but it is **only used to sign the OAuth `state` CSRF token** — not applied to stored tokens.

A DB read by anyone (backup leak, SQL injection, a curious DB admin, a misconfigured `LOG_LEVEL=debug` — see below) exposes every user's Gmail credentials.

### Compounding issue — `LOG_LEVEL=debug` leaks tokens via query logs

`packages/database/src/index.ts:10–15` configures Prisma logging:
```ts
log: env.LOG_LEVEL === "debug" ? ["query","error","warn"] : ["error","warn"]
```
The `"query"` level emits **every SQL statement with bound parameters**, so a `LOG_LEVEL=debug` deployment writes OAuth tokens to stdout/logs. **Fix this as part of 02a/02b:** never enable `["query"]` in production regardless of `LOG_LEVEL`. Use a separate `LOG_SQL` flag that defaults to `false` and is never set in prod.

### Goal

1. All `access_token`, `refresh_token`, `id_token` fields are stored AES-256-GCM encrypted using `ENCRYPTION_KEY`.
2. Reads transparently decrypt (no changes to call sites outside the data layer).
3. Existing rows are migrated without downtime.
4. Prisma query logging never emits token values in production.

---

## Implementation steps (02b)

### Step 1 — Decide the encryption boundary

**Recommended: a Prisma extension (`$extends`) on the `@coldjot/database` client** that encrypts on write and decrypts on read for the tagged fields. This keeps the logic in one place and means every consumer (web + mailops) gets the behavior automatically.

Alternative (simpler but more invasive): explicit `encrypt()`/`decrypt()` calls at every read/write site. Not recommended — too easy to forget.

### Step 2 — Extend `lib/crypto.ts`

The existing `encrypt`/`decrypt` are fine for the `state` use case but verify they:
- Use AES-256-GCM (not CBC).
- Emit a per-record random IV (`crypto.randomBytes(12)`).
- Return a self-describing format like `iv:ciphertext:tag` (base64) so decryption can parse it.
- Throw (not silently fall back to `""`) if `ENCRYPTION_KEY` is unset.

If the current implementation stores the IV deterministically or reuses it, **rewrite it**. A safe shape:

```ts
// apps/web/src/lib/crypto.ts  (and re-export from packages/database or a shared package)
import crypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

function getKey(): Buffer {
  const k = process.env.ENCRYPTION_KEY;
  if (!k) throw new Error("ENCRYPTION_KEY is not set");
  // Derive a 32-byte key from the passphrase (don't use it raw unless it's exactly 32 bytes)
  return crypto.createHash("sha256").update(k).digest();
}

export function encrypt(plain: string | null | undefined): string | null {
  if (plain == null) return null;
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), enc.toString("base64"), tag.toString("base64")].join(":");
}

export function decrypt(payload: string | null | undefined): string | null {
  if (payload == null) return null;
  // Backward-compat: if the value isn't in iv:enc:tag format, assume plaintext (migration window)
  const parts = payload.split(":");
  if (parts.length !== 3) return payload;            // ← legacy plaintext passthrough
  const [ivb, encb, tagb] = parts;
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivb, "base64"));
  decipher.setAuthTag(Buffer.from(tagb, "base64"));
  const dec = Buffer.concat([decipher.update(encb, "base64"), decipher.final()]);
  return dec.toString("utf8");
}
```

> The "if not 3 parts, assume plaintext" branch is the **dual-read** that makes the migration non-downtime. Remove it ~30 days after migration completes (a follow-up plan).

### Step 3 — Wire the extension into the Prisma client

In `packages/database/src/index.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { encrypt, decrypt } from "./crypto"; // or from a shared util

const TOKEN_FIELDS = ["access_token", "refresh_token", "id_token"] as const;
const TOKEN_MODELS = ["Mailbox", "Account"] as const;

const prismaClientSingleton = () =>
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error", "warn"],
    // NEVER include "query" in production.
  }).$extends({
    result: {
      mailbox: Object.fromEntries(
        TOKEN_FIELDS.map((f) => [f, { needs: { [f]: true }, compute: (m) => decrypt(m[f]) }])
      ),
      account: Object.fromEntries(
        TOKEN_FIELDS.map((f) => [f, { needs: { [f]: true }, compute: (a) => decrypt(a[f]) }])
      ),
    },
    query: {
      mailbox: {
        async create({ args, query }) { encryptFields(args.data); return query(args); },
        async update({ args, query }) { encryptFields(args.data); return query(args); },
        // upsert, createMany, updateMany as needed
      },
      account: { /* same */ },
    },
  });

function encryptFields(data: any) {
  if (!data) return;
  for (const f of TOKEN_FIELDS) if (typeof data[f] === "string") data[f] = encrypt(data[f]);
}
```

> Prisma extension result callbacks run **on read**, query callbacks run **on write**. This transparently encrypts on the way in and decrypts on the way out. All existing call sites (`callback/route.ts`, mailops Gmail client) keep working unchanged.

⚠️ **Caveat:** `$extends.result` only transforms fields when they're selected. Call sites that do `select: { access_token: false }` won't trigger it (fine). Call sites that project raw SQL won't be covered (none exist — see plan 06, no raw SQL found).

### Step 4 — Backfill existing rows

Write a one-off script (run once, in production):

```ts
// packages/database/scripts/backfill-encryption.ts
import { PrismaClient } from "@prisma/client";
import { encrypt } from "./crypto";

const prisma = new PrismaClient(); // raw, NO extension — so we read plaintext & write pre-encrypted

async function backfill(model: "mailbox" | "account") {
  const rows = await (prisma[model] as any).findMany({
    select: { id: true, access_token: true, refresh_token: true, id_token: true },
  });
  for (const r of rows) {
    await (prisma[model] as any).update({
      where: { id: r.id },
      data: {
        access_token: encrypt(r.access_token),
        refresh_token: encrypt(r.refresh_token),
        id_token: encrypt(r.id_token),
      },
    });
  }
}

(async () => { await backfill("mailbox"); await backfill("account"); })();
```

Because `decrypt()` falls back to plaintext for non-encrypted values (Step 2), you can run this against a live system: rows already encrypted are skipped safely (re-encrypting an encrypted value would corrupt — guard against double-encryption in the script by checking the `:` format).

### Step 5 — Fix Prisma logging

In `packages/database/src/index.ts`, remove `["query", ...]` entirely or gate it behind a non-prod flag:

```ts
log: process.env.LOG_SQL === "true" && process.env.NODE_ENV !== "production"
  ? ["query", "error", "warn"]
  : ["error", "warn"],
```

### Step 6 — Rotate `ENCRYPTION_KEY` safely

Rotating `ENCRYPTION_KEY` invalidates all existing ciphertext. To rotate:
1. Deploy a version that supports **two** keys (`ENCRYPTION_KEY` for encryption, `ENCRYPTION_KEY_OLD` accepted for decryption).
2. Run a backfill that re-encrypts every row.
3. Remove `ENCRYPTION_KEY_OLD`.

This belongs in a follow-up runbook but the crypto helper should be designed with it in mind (a `decrypt` that tries `KEY` then `KEY_OLD`).

---

## Files to touch

**02a:**
- Delete: `apps/web/env/.env.production`, `apps/web/env/.env.extra`, `apps/mailops/env/.env.production`, `apps/mailops/env/.env.extra`, `packages/database/env/.env.production`, `packages/database/env/.env.development`
- Modify: `.gitignore` (consolidate), `apps/web/src/env.ts`, `apps/mailops/src/config/env.ts` (add boot validation — overlaps with plan 11)
- Create: `.env.example` files (if not present) for each app/package

**02b:**
- Modify: `apps/web/src/lib/crypto.ts` (rewrite if needed)
- Modify: `packages/database/src/index.ts` (add `$extends`, fix logging)
- Create: `packages/database/scripts/backfill-encryption.ts` (one-off)
- Create: `packages/database/src/crypto.ts` (or a shared util) if you want mailops and web to share the same code

---

## Verification

### 02a
- `git log --all -- '<each deleted file>'` returns nothing.
- `grep -r "<old-password-substring>" .` (excluding `.git`) returns nothing.
- App boots and authenticates against the rotated DB password and Google secrets.
- A fresh `git clone` + `npm install` + `npm run dev` requires the developer to supply env vars (no secrets in repo).

### 02b
- After deploying the extension but **before** backfill: existing flows still work (because `decrypt` falls back to plaintext).
- After backfill: query the DB directly — `SELECT access_token FROM "Mailbox" LIMIT 5;` should show `iv:enc:tag` strings, **not** `ya29.…` tokens.
- Through the app, `GET /api/mailboxes/:id` still returns a working mailbox (decryption is transparent).
- Sending an email via mailops still works end-to-end.
- Set `LOG_LEVEL=debug` in **production**-like env and confirm no token strings appear in logs (after the logging fix).

---

## Risks & rollback

- **Rotating Google client secrets invalidates all refresh tokens** — users must re-connect mailboxes. Communicate this. Consider doing it during a planned maintenance window.
- **Rotating `ENCRYPTION_KEY` without the dual-key path** locks every user out of their mailbox (tokens become undecryptable). Never rotate `ENCRYPTION_KEY` without Step 6.
- **Prisma extension pitfalls:** result-compute requires the field to be selected; if some code path reads the column via `$queryRaw` it bypasses the extension. No raw SQL exists today (plan 06), but enforce a lint rule against new raw SQL.
- **Backfill double-encryption:** the script must detect already-encrypted rows (3-part format) and skip them. Test on a staging DB copy first.
- **Rollback (02b):** disable the `$extends`, redeploy. Existing encrypted rows will appear as `iv:enc:tag` strings to consumers and break Gmail auth — so rollback requires either the dual-read `decrypt` or a decrypt-backfill. Keep the plaintext-passthrough branch for at least one release cycle.
