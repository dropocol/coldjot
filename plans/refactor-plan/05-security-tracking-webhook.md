# Plan 05 — Fix the No-op Tracking Endpoint, Open Redirect & Unauthenticated Analytics

> **Severity:** 🔴 HIGH
> **Effort:** Medium (~1 day)
> **Depends on:** Nothing. Coordinate with plan 03 (tracking lives in mailops too) and plan 04 (input validation).

---

## Problem

The email-tracking subsystem is broken on multiple axes simultaneously.

### Issue 1 — The tracking endpoint is a **no-op** (functional bug)

`apps/web/src/app/api/track/[...slug]/route.ts` validates the request, computes UA/IP/location… then **returns `{ success: true }` without recording anything.** The actual recording call is commented out (L37–46). The imports `EmailEventType` (L3) and `trackingClient` (L6) are unused.

So: **email-open and click tracking has been silently broken.** Whatever analytics the UI shows from this endpoint is stale/empty.

```ts
// L35–48 — the work is commented out:
try {
  // await trackingClient.trackEmailEvent({
  //   emailId, eventType, ...
  // });
  return NextResponse.json({ success: true });
}
```

### Issue 2 — Auth/ownership gap on the same endpoint

There's no check that `emailId` belongs to the caller or that the caller is the intended recipient. Anyone who knows an `emailId` can POST fake opens/clicks. (For a tracking pixel this is somewhat inherent, but the endpoint should at least be public-by-design and rate-limited — currently it's neither.)

Also: middleware (`apps/web/middleware.ts`) enforces a session for `/api/*` *except* for `PUBLIC_PATHS = ["/", "/login", "/signup", "/api/auth"]`. `/api/track/...` is **not** in `PUBLIC_PATHS`, so an email client following the pixel would be redirected to `/login` HTML — meaning the POST likely never records even if the code worked. Either it's broken-by-auth or there's an untested path; either way it needs to be made explicitly public and functional.

### Issue 3 — `x-forwarded-for` trusted raw

`apps/web/src/app/api/track/[...slug]/route.ts:29–32`:
```ts
const ipAddress =
  req.headers.get("x-forwarded-for") ||
  req.headers.get("x-real-ip") ||
  "unknown";
```
`x-forwarded-for` is a comma-separated chain and is client-spoofable. The whole string is passed to `getIpLocation`. An attacker can set it to anything.

### Issue 4 — Open redirect in mailops link tracking

`apps/mailops/src/routes/tracking/controller.ts:77–95` (`handleLinkClick`) does `res.redirect(redirectUrl)` where `redirectUrl` comes from a DB lookup keyed on an **unauthenticated** hash. The lookup itself is fine (the hash is unguessable in practice), but the redirect target must be validated — if a tracked link's destination can ever be user-controlled to an arbitrary external URL, this is an open-redirect that can be used in phishing. Also, the controller has no rate limiting.

### Issue 5 — Unauthenticated analytics writes

`apps/mailops/src/routes/tracking/controller.ts:97–113` (`trackEmailEvent`) accepts arbitrary `trackingId` / `eventType` / `metadata` with **no auth, no rate limit, no validation that the trackingId exists or that eventType is in the enum.** This is writable analytics injection — an attacker can inflate/deflate any campaign's stats.

### Issue 6 — IP geolocation is a stub

`apps/web/src/lib/ip-location.ts:9` has `// TODO: Implement actual IP geolocation service`. The function presumably returns a stub. Either implement it or stop storing the field.

---

## Goal

1. Email open/click tracking **actually records events**.
2. The tracking pixel endpoint is **explicitly public** (exempted from the auth middleware) and **rate-limited per IP**.
3. `eventType` is validated against the `EmailEventType` enum; `emailId`/`trackingId` is validated to exist and be active.
4. The link-click redirect target is validated against an allowlist (or compared to the originally-stored URL) — no open redirect.
5. `x-forwarded-for` is parsed correctly (first hop) and treated as untrusted.
6. IP geolocation either works or the field is removed.

---

## Implementation steps

### Step 1 — Decide the tracking architecture

There appear to be **two** tracking surfaces: a web endpoint (`apps/web/.../api/track/[...slug]`) and a mailops tracking router (`apps/mailops/src/routes/tracking/`). Pick one canonical home for tracking to avoid duplication:

- **Recommendation:** tracking pixels/links should resolve through **mailops** (it already has `trackingService` and the DB access), and the web `/api/track` endpoint should either be deleted or thin-proxy to mailops. The mailops service is the right place because it already owns email sending and event processing.

Document the decision and remove the dead web endpoint if mailops is canonical.

### Step 2 — Make the web tracking endpoint public (if keeping it)

In `apps/web/middleware.ts`, add `/api/track` to `PUBLIC_PATHS`:

```ts
const PUBLIC_PATHS = ["/", "/login", "/signup", "/api/auth", "/api/track"];
```

If you delete it (Step 1), skip this.

### Step 3 — Restore the actual recording logic

In whichever endpoint is canonical, restore (and modernize) the recording call. Using the validation patterns from plan 04:

```ts
// schema
const trackEventSchema = z.object({
  emailId: z.string().cuid(),
  // eventType comes from the path param, validated separately
});

export async function POST(req: Request, { params }: { params: Promise<{ eventType: string }> }) {
  const { eventType } = await params;
  const normalized = eventType.toUpperCase();

  // Validate against the enum
  if (!Object.values(EmailEventType).includes(normalized as EmailEventType)) {
    return NextResponse.json({ error: "Invalid event type" }, { status: 400 });
  }

  const body = await parseBody(req, trackEventSchema);
  if (!body.ok) return body.response;
  const { emailId } = body.data;

  // Verify the tracking record exists & is active (also prevents writing events for unknown ids)
  const tracking = await prisma.emailTracking.findFirst({
    where: { id: emailId, status: "active" },
    select: { id: true },
  });
  if (!tracking) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ip = getClientIp(req); // helper from Step 5
  const location = await getIpLocation(ip);

  await trackingClient.trackEmailEvent({
    emailId,
    eventType: normalized as EmailEventType,
    metadata: {
      userAgent: getUserAgent(req).userAgent,
      ipAddress: ip,
      location: JSON.stringify(location),
    },
  });

  return NextResponse.json({ success: true });
}
```

### Step 4 — Validate `eventType` and `trackingId` in mailops too

Apply the same enum check and existence check in `apps/mailops/src/routes/tracking/controller.ts:trackEmailEvent`. Add rate limiting (Step 7).

### Step 5 — Fix `x-forwarded-for` parsing

Add a helper `apps/web/src/lib/http/ip.ts` (and mirror in mailops):

```ts
export function getClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    // First hop is the original client; subsequent hops are proxies.
    const first = xff.split(",")[0]?.trim();
    if (first && isValidIp(first)) return first;
  }
  return req.headers.get("x-real-ip") ?? null;
}

function isValidIp(s: string): boolean {
  // crude v4/v6 validation; or use a lib like `ipaddr.js`
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(s) || /^[0-9a-f:]+$/i.test(s);
}
```

> Even the "first hop" is spoofable if there's no trusted proxy in front. Document that accurate IP requires trusting only your own proxy's `x-forwarded-for` append. In Vercel/Next this is generally fine.

### Step 6 — Close the open redirect in `handleLinkClick`

`apps/mailops/src/routes/tracking/controller.ts:77–95`. The `redirectUrl` should come **only** from the stored `TrackedLink` row, never from the query string. Verify the controller doesn't accept a URL from `req.query` — it currently takes only `lid` (link id) and looks up the URL server-side, which is correct. Confirm:

- The lookup is by `hash` + `linkId`, both of which are unguessable opaque IDs.
- The returned `redirectUrl` is the original URL stored when the link was created.

Then add defense-in-depth: before redirecting, validate the URL scheme:

```ts
function isSafeRedirect(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

if (!isSafeRedirect(redirectUrl)) {
  return res.status(400).json({ error: "Invalid redirect target" });
}
return res.redirect(redirectUrl);
```

This blocks `javascript:`, `data:`, and other dangerous schemes if a stored URL is ever malformed.

### Step 7 — Add rate limiting to public tracking endpoints

Both `/track` and the link-click endpoint are unauthenticated and therefore abusable. Add a simple in-memory or Redis-backed rate limiter (Redis is already a dependency — see `apps/mailops/src/services/shared/redis/`):

- Per-IP limit on `/track` POST: e.g. 60/min.
- Per-IP limit on link-click: e.g. 120/min.

A tiny Express middleware using `ioredis`:
```ts
// apps/mailops/src/lib/rate-limit.ts
import type { Request, Response, NextFunction } from "express";
import { getRedis } from "@/services/shared/redis/connection";

export function rateLimit(key: string, limit: number, windowSec: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip ?? "unknown";
    const k = `rl:${key}:${ip}`;
    const count = await getRedis().incr(k);
    if (count === 1) await getRedis().expire(k, windowSec);
    if (count > limit) return res.status(429).json({ error: "Too many requests" });
    next();
  };
}
```

Apply: `router.post("/track", rateLimit("track", 60, 60), handler);`

### Step 8 — Implement or remove `getIpLocation`

`apps/web/src/lib/ip-location.ts:9` is a stub. Either:
- Wire it to a real geo-IP service (MaxMind GeoLite2 — free, self-hosted; or a hosted API), or
- Delete the call sites and the `location` metadata field if geolocation isn't a product requirement.

Don't ship a stub that silently stores `"unknown"` forever.

---

## Files to touch

**Modify:**
- `apps/web/src/app/api/track/[...slug]/route.ts` (restore recording, validate input, fix IP) — or delete if mailops is canonical
- `apps/web/middleware.ts` (add `/api/track` to PUBLIC_PATHS, if keeping the web endpoint)
- `apps/mailops/src/routes/tracking/controller.ts` (validate eventType/trackingId, safe-redirect check, rate limit)
- `apps/mailops/src/routes/tracking/index.ts` (mount rate-limit middleware)
- `apps/web/src/lib/ip-location.ts` (implement or remove)
- `apps/mailops/src/lib/tracking/index.ts` (the `trackingService` — verify `handleLinkClick` returns only stored URLs)

**Create:**
- `apps/web/src/lib/http/ip.ts` (and/or `apps/mailops/src/lib/http/ip.ts`)
- `apps/mailops/src/lib/rate-limit.ts`

---

## Verification

### Functional
1. Send a test email with tracking enabled. Open it in a mail client. Within a minute, query `EmailEvent` for that `emailId` — a new `OPENED` event should exist with UA/IP populated.
2. Click a tracked link — it should redirect to the original URL **and** a `CLICKED` event should appear.
3. Before the fix: no events appear (the endpoint is a no-op). After: events appear.

### Security
4. `POST /api/track/INVALID` → 400 (eventType validated).
5. `POST /api/track/OPENED` with a non-existent `emailId` → 404.
6. Spamming the endpoint from one IP → 429 after the limit.
7. If a `TrackedLink` row is maliciously set to `javascript:alert(1)`, the click returns 400 instead of redirecting (safe-redirect check).

### Regression
8. Legitimate opens/clicks from real email clients still work end-to-end and stats render in the UI.

---

## Risks & rollback

- **Deciding canonical home (Step 1):** if you delete the web endpoint, ensure no client code calls it. Grep `apps/web/src` for `/api/track`.
- **Rate limiting could block legitimate high-volume sends** (e.g., a mailing list where many recipients share a corporate NAT IP). Tune limits per observed traffic, or exempt requests carrying a valid signed pixel token.
- **Open-tracking privacy:** some email clients (Apple Mail, others) pre-fetch pixels, inflating open counts. That's a product decision, not a security one — but document it.
- **Rollback:** all changes are additive/conditional; revert per file. No DB migration needed (the `EmailEvent` table already exists).
