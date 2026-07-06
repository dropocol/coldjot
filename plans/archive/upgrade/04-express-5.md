# Step 4 — `upgrade/express-5` (apps/mailops only)

> Branch: `upgrade/express-5` off the merged `upgrade/tailwind-4`.
> Bump express 4.21 → 5.2.1 (latest).

## Goal
Move mailops to Express 5 with **zero behavior change**. Exploration confirmed no removed-in-v5 APIs are used, so this is a small, low-risk bump.

## Bumps
- `apps/mailops/package.json`: `express` `^4.21.2` → `^5.2.1`; `@types/express` `^4.17.21` → `^5.0.6`.

## Breaking-change audit (done during planning)

### Removed-in-v5 APIs — **none used** ✅
| Removed API | Used in mailops? |
|---|---|
| `app.del(...)` | ❌ only `router.delete` |
| `req.param("x")` | ❌ params via destructuring |
| `res.sendfile` (lowercase) | ❌ |
| `res.json(status, body)` two-arg | ❌ always `.status().json()` |
| Query-parser middleware / `app.set("query parser")` | ❌ |

### Path-to-regexp v6 (Express 5's router)
All routes use simple params: `/:id`, `/:hash`, `/:email`, `/:listId`, `/:id/launch`, `/:id/pause|resume|reset`, `/:hash/click`, `/:listId/sync`. **No regex groups, no optional params** → no pattern changes needed.

### Async error handling — **no-op behavior change** ✅
Today every async route handler `try/catch`es and calls `res.status(...).json(...)` inside the catch — **none call `next(err)`**. Express 5 automatically forwards rejected async handlers to the error middleware, but since handlers already self-handle, this changes nothing. **Do not refactor the catch blocks** — keep behavior identical.

The two global 4-arg error middlewares (in `server.ts`) still fire for sync throws / programmer errors. Verify they still type correctly under `@types/express@5`.

### Single-arg `res.redirect(redirectUrl)` — v5-compatible ✅
Used in `routes/tracking/controller.ts:116`. The single-arg form is valid in v5.

## Verification
1. `npm install` succeeds.
2. `tsc --noEmit` passes in mailops.
3. `npm run build` (tsup) succeeds.
4. `npm run lint` passes.
5. **Runtime smoke:**
   - Boot mailops.
   - `curl -X POST http://localhost:3001/api/sequences/x/launch -H "Content-Type: application/json" -d '{}'` → **401** (no `X-Service-Token`).
   - Same with the header → proceeds past auth.
   - `curl http://localhost:3001/check` → **200**.
   - POST a PubSub message → handled.
   - Trigger a queue enqueue (e.g. via a sequence launch) → job appears in BullMQ.

## Risks & rollback
- **`@types/express@5` typing changes** may surface type errors on `req`/`res` usage — fix as they appear (usually straightforward).
- **Body parsing**: Express 5 keeps `express.json()` builtin (mailops uses it). No change.
- Rollback: revert the commit; `npm install` restores express 4.
