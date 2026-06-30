# Plan 03 — Add Service Auth & CORS Allowlist to the Mailops Backend

> **Severity:** 🔴 CRITICAL
> **Effort:** Medium (1–2 days)
> **Depends on:** Nothing structurally, but coordinate with plan 01 (web must send the new auth header) and plan 09 (logging).

---

## Problem

The mailops Express service (`apps/mailops/src/server.ts`, port 3001) has **no authentication on any `/api/*` route**. Worse, every controller trusts a **client-supplied `userId`** from the request body and uses it only as a Prisma `where` filter — never as an authenticated identity. Combined with wildcard CORS, this means any website or any client that can reach port 3001 can:

- Launch, pause, resume, or reset any user's sequence
- Arm Gmail push notifications against any user's mailbox
- Trigger list syncs
- Write fake analytics events
- Read queue health and metrics

### Confirmed instances

| File | Line | Issue |
|---|---|---|
| `apps/mailops/src/server.ts` | 22 | `app.use(cors())` — wildcard origin, no allowlist |
| `apps/mailops/src/server.ts` | 45–49 | All routes mounted with no auth middleware |
| `apps/mailops/src/routes/index.ts` | 10–19 | Central router mounts sub-routers with no middleware |
| `apps/mailops/src/routes/sequence/controller.ts` | 78, 163, 197, 229 | `launchSequence`, `pauseSequence`, `resumeSequence`, `resetSequenceHandler` all do `const { userId } = req.body` |
| `apps/mailops/src/routes/sequence/validator.ts` | 3–54 | Validators only check `userId` is *present*, never that it belongs to the caller |
| `apps/mailops/src/routes/mailbox.ts` | 11–14, 97–103 | `MailboxWatchSchema` accepts `userId` + `email` from body and sets up a Gmail watch using stored tokens |
| `apps/mailops/src/routes/lists/index.ts` | 8–40 | `/:listId/sync` takes `listId`/`sequenceId` from body, no ownership check |
| `apps/mailops/src/routes/tracking/controller.ts` | 77–95 | `handleLinkClick` → open redirect via unauthenticated `redirectUrl`; `trackEmailEvent` (97–113) accepts arbitrary `trackingId`/`eventType`/`metadata` — analytics injection |
| `apps/mailops/src/routes/health/index.ts` | 9 | `/health/queues/status` unauthenticated |
| `apps/mailops/src/routes/metrics/index.ts` | — | `/metrics` unauthenticated |

### What IS already authenticated
- The Gmail PubSub webhook (`apps/mailops/src/routes/pubsub.ts:38–50`) **does** verify Google's signed JWT via `verifyPubSubJwt` (`apps/mailops/src/lib/auth/pubsub.ts:42–84`) — JWKS kid lookup, RS256 signature, audience, issuer. **That pattern is correct.** This plan is about everything *else*.

### CORS specifics
`cors()` with no options reflects `Access-Control-Allow-Origin: *` for any origin. The `WEB_APP_URL` env var exists (`apps/mailops/src/config/env.ts:31`) but is not wired into an allowlist.

---

## Goal

1. **Every non-public mailops route requires a service auth token** proving the caller is the trusted web app (or another trusted internal service).
2. **`userId` is never trusted from the body** for authorization — it's either derived from the auth token, or — if the web app passes it — the route also verifies ownership of the target resource.
3. **CORS is restricted** to the known web origin(s).
4. **Public endpoints** (health, metrics, tracking pixel, PubSub webhook) are explicitly allowlisted and have their own targeted protections.
5. **The PubSub error handler** stops always returning 200 (it breaks PubSub retry semantics and masks auth failures).

---

## Implementation steps

### Step 1 — Define the service-auth contract

Add a **shared internal service token** (`SERVICE_INTERNAL_TOKEN`) that both web and mailops read from env (same value). Use it as a shared secret over the wire.

> Why a shared secret and not mTLS/JWT? Pragmatic for a 2-service internal setup behind a private network/VPC. If you ever expose mailops to the public internet, upgrade to mTLS or short-lived JWTs signed with a private key.

**Auth header format:** `X-Service-Token: <token>`. Optionally also `Authorization: Bearer <token>` to share tooling.

Add the env var to:
- `apps/web/env/.env*` (as `MAILOPS_SERVICE_TOKEN`)
- `apps/mailops/env/.env*` (as `SERVICE_INTERNAL_TOKEN`)

And to the zod schemas (plan 11): both apps fail at boot if the value is missing.

> Also consider a **timing-safe comparison** to avoid token timing attacks (see Step 3 helper).

### Step 2 — Create the auth middleware

Create **`apps/mailops/src/lib/auth/service-auth.ts`**:

```ts
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Requires a valid X-Service-Token header matching SERVICE_INTERNAL_TOKEN.
 * Use on every internal route mounted by the web app.
 */
export function requireServiceToken(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.SERVICE_INTERNAL_TOKEN;
  const provided = req.header("x-service-token");
  if (!expected || !provided || !timingSafeEqualStr(provided, expected)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
```

### Step 3 — Apply the middleware to internal routes

In `apps/mailops/src/server.ts`, replace the bare mounting:

```ts
import { requireServiceToken } from "@/lib/auth/service-auth";

// Internal API — requires service token
app.use("/api", requireServiceToken, routes);
app.use("/api/mailbox", requireServiceToken, mailboxRouter);
app.use("/api/lists", requireServiceToken, listsRouter);

// Public/webhook routes — no service token (they have their own auth)
app.use("/pubsub", pubsubRouter);
app.use("/api/pubsub", pubsubRouter);
app.use("/check", (req, res) => res.status(200).json({ message: "OK" }));
```

`health` and `metrics` need a decision:
- If they're used by load balancers/k8s liveness probes → keep them **unauthenticated** but move to dedicated paths (`/live`, `/ready`) that return no sensitive data.
- If they expose queue depth, job counts, etc. → put them behind `requireServiceToken`.

**Recommendation:** split `/health` (public, returns `{ ok: true }`) from `/metrics` (service-token-gated, returns queue details).

### Step 4 — Stop trusting `userId` from the body

This is the deeper fix. Two options:

**Option A (preferred): the web app passes `userId` and mailops re-verifies ownership of the target resource.**

For each controller that operates on a `Sequence`, `Mailbox`, `List`, etc., add an ownership check using Prisma:

```ts
// apps/mailops/src/routes/sequence/controller.ts  (launchSequence, ~L78)
export async function launchSequence(req: Request, res: Response) {
  const { userId, sequenceId } = req.body;

  const sequence = await prisma.sequence.findFirst({
    where: { id: sequenceId, userId },   // ← ownership enforced server-side
  });
  if (!sequence) return res.status(404).json({ error: "Sequence not found" });

  // ... proceed with launch
}
```

The body `userId` is now a **claim**, but the Prisma query (`findFirst({ where: { id, userId } })`) ensures a caller can only act on resources they own. Even if an attacker steals the service token, they can't cross tenants (defense in depth).

**Option B (stronger): the web app mints a short-lived JWT signed with `SERVICE_INTERNAL_TOKEN` carrying `{ sub: userId }`, and mailops verifies it.** This avoids passing `userId` in the body entirely. More work, more secure. Choose this if mailops might ever be called by services other than web.

Either way, **delete every `const { userId } = req.body` that authorizes purely on presence.**

### Step 5 — Fix the specific dangerous controllers

| Controller | Fix |
|---|---|
| `sequence/controller.ts` launch/pause/resume/reset (L78, 163, 197, 229) | After extracting `userId` + `sequenceId` from body, fetch the sequence with `findFirst({ where: { id: sequenceId, userId } })` and 404 if not found. |
| `mailbox.ts` watch (L11–14, 97–103) | Fetch the mailbox with `findFirst({ where: { email, userId } })` before arming the watch. 404 if not found. |
| `lists/index.ts` `/:listId/sync` (L8–40) | Verify both the list AND the sequence belong to `userId` before creating a sync record. |
| `tracking/controller.ts` `trackEmailEvent` (L97–113) | This endpoint is called by the **public tracking pixel**, so it can't use a service token. Instead: (a) only accept `trackingId`s that exist and are marked active, (b) rate-limit per-IP, (c) validate `eventType` against the enum. See plan 05 for the full tracking redesign. |
| `tracking/controller.ts` `handleLinkClick` (L77–95) | **Validate the redirect URL** against an allowlist of schemes/hosts (reject anything that isn't `http`/`https` and ideally matches the tracked link's originally-stored URL). The DB already stores the real destination — use that, don't trust query params. See plan 05. |

### Step 6 — Restrict CORS

In `apps/mailops/src/server.ts`:

```ts
import { env } from "@/config/env"; // see plan 11

const allowedOrigins = [env.WEB_APP_URL].filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      // allow same-origin / curl (no Origin header) and allowlisted origins
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
```

> If the web app calls mailops via `fetch` from the browser (it appears to, e.g. via `NEXT_PUBLIC_MAILOPS_API_URL`), the browser will send an `Origin` header — this allowlist permits it. Server-to-server calls (no `Origin`) are also allowed.

### Step 7 — Fix the PubSub error middleware

`apps/mailops/src/server.ts:52–70` currently returns `200` for every error on `/pubsub`. Returning 200 to Google PubSub tells it "don't retry," which silently drops failed notifications and masks auth failures. Fix:

```ts
app.use(
  "/pubsub",
  (err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ error: err }, "PubSub notification error");
    // 4xx → PubSub retries with backoff; 5xx → also retries. Only return 200 on success.
    const status = res.statusCode && res.statusCode >= 400 ? res.statusCode : 500;
    res.status(status).json({ error: "Notification processing failed" });
  }
);
```

> The success path in the route handler already returns 200 explicitly; the error path should not.

### Step 8 — Update the web app to send the token

Every call from web → mailops needs the header. Centralize this in the existing `apps/web/src/lib/queue/queue-api-client.ts` (already the single mailops client per plan 07/11):

```ts
// apps/web/src/lib/queue/queue-api-client.ts
const headers: HeadersInit = {
  "Content-Type": "application/json",
  "X-Service-Token": env.MAILOPS_SERVICE_TOKEN,
};
```

Grep for any other direct `fetch` to the mailops URL and route them through this client:
```bash
rg -n "MAILOPS_API_URL" apps/web/src
```

---

## Files to touch

**Create:**
- `apps/mailops/src/lib/auth/service-auth.ts` (middleware)

**Modify:**
- `apps/mailops/src/server.ts` (mount middleware, CORS, fix pubsub error handler)
- `apps/mailops/src/routes/sequence/controller.ts` (ownership checks)
- `apps/mailops/src/routes/sequence/validator.ts` (tighten schemas)
- `apps/mailops/src/routes/mailbox.ts` (ownership check before watch)
- `apps/mailops/src/routes/lists/index.ts` (ownership check)
- `apps/mailops/src/routes/health/index.ts` (split public/internal)
- `apps/mailops/src/routes/metrics/index.ts` (gate behind token)
- `apps/mailops/src/config/env.ts` (add `SERVICE_INTERNAL_TOKEN` to zod schema)
- `apps/web/src/lib/queue/queue-api-client.ts` (send header)
- `apps/web/src/env.ts` (add `MAILOPS_SERVICE_TOKEN`)

**Env:**
- Add `SERVICE_INTERNAL_TOKEN` / `MAILOPS_SERVICE_TOKEN` (same value) to both apps' env (use a fresh `openssl rand -hex 32`).

---

## Verification

### Manual

1. **Unauthenticated internal call should now 401:**
   ```bash
   curl -X POST http://localhost:3001/api/sequence/launch \
     -H "Content-Type: application/json" \
     -d '{"userId":"<x>","sequenceId":"<y>"}'
   # Expected: 401 Unauthorized
   ```
2. **Authenticated call with foreign userId should 404** (Option A from Step 4):
   ```bash
   curl -X POST http://localhost:3001/api/sequence/launch \
     -H "Content-Type: application/json" -H "X-Service-Token: <token>" \
     -d '{"userId":"<ATTACKER>","sequenceId":"<VICTIM_SEQ>"}'
   # Expected: 404 Not Found (findFirst scoped by userId)
   ```
3. **Legitimate call works** as before (from the web app).
4. **CORS:** from a browser console on a non-allowlisted origin, `fetch("http://localhost:3001/api/...", {credentials:"include"})` should be blocked by CORS.

### Automated
- Add an integration test that calls each internal route (a) without token → 401, (b) with token + foreign userId → 404, (c) with token + own userId → 200.

---

## Risks & rollback

- **Deploy ordering:** mailops must be deployed with the middleware **before/with** the web app sending the token, otherwise the web app's calls start failing with 401. Deploy mailops first with a feature flag (`AUTH_REQUIRE_TOKEN=false`) that logs warnings when the header is missing, observe for a day, then flip the flag.
- **Forgotten call sites:** if any web code calls mailops directly (not through `queue-api-client.ts`), those calls break. Mitigate with the feature-flag phase-in above and the grep audit.
- **PubSub retry storm:** fixing the error middleware to return non-200 means Google will retry failed notifications — make sure your handlers are idempotent (they mostly are, via `ProcessedMessage` dedup). Verify with a deliberate failure test.
- **Rollback:** revert the middleware mount; the routes return to open access. Token checks are additive.
