# Plan 01 — Fix IDOR & Add an Authorization Layer to Web API Routes

> **Severity:** 🔴 CRITICAL
> **Effort:** Medium (1–2 days)
> **Depends on:** Nothing. Other plans (04) build on the helpers introduced here.

---

## Problem

Several web API routes verify that the **parent** resource (e.g. an `EmailList` or `Sequence`) belongs to the calling user, but then connect/modify **child** resources (e.g. `Contact` rows) **without checking ownership of the child**. Because `Contact.userId` exists in the schema but is never enforced at the relation-connect site, an authenticated user can attach another tenant's contacts to their own lists or sequences simply by guessing/enumerating a `contactId`.

This is a classic **Insecure Direct Object Reference (IDOR)** vulnerability.

### Confirmed instances (with evidence)

| # | File | Line | Issue |
|---|---|---|---|
| 1 | `apps/web/src/app/api/lists/[id]/route.ts` | ~105–107 | PATCH does `contacts: { set: contacts.map((id) => ({ id })) }` — re-points the list to **arbitrary** contact IDs with no `userId` filter. Only the `EmailList` row is ownership-checked. |
| 2 | `apps/web/src/app/api/lists/[id]/contacts/route.ts` | POST ~116–118, PUT ~295, DELETE ~383 | `connect: { id: contactId }` / `set` with arbitrary IDs; only the parent list is ownership-checked. |
| 3 | `apps/web/src/app/api/sequences/[id]/contacts/route.ts` | POST ~157–163 | `sequenceContact.create` connects `contactId` with **no check that the contact belongs to the user**. Sequence ownership is checked; contact ownership is not. |
| 4 | `apps/web/src/app/api/sequences/[id]/steps/[stepId]/route.ts` | PUT ~49–71 | **Mass-assignment:** spreads raw JSON body into `prisma.sequenceStep.update({ data })`, stripping only `sequenceId` and `type`. Client can set arbitrary columns (`order`, etc.). |
| 5 | `apps/web/src/app/api/admin/users/[id]/route.ts` | ~19 | Uses `where: { email: session.user.email! }` — non-null assertion; if email is undefined the query matches an arbitrary row. Also imports `prisma` from `@/lib/prisma` (a potential second Prisma client) instead of `@coldjot/database`. |

### Why middleware doesn't save us

`apps/web/middleware.ts` enforces a session exists (redirects unauthenticated users to `/login`) and onboarding status. It does **not** do resource ownership checks — that responsibility lives in each handler. The current handlers do it inconsistently.

### Secondary issues in the same area

- Auth checks are written 3 different ways across routes:
  - `if (!session)` (weakest — `contacts/route.ts`, `contacts/batch/route.ts`)
  - `if (!session?.user?.id)` (most common)
  - `if (!session?.user)` (admin route)
- Unreachable 404 branches after Prisma `delete`/`update` (Prisma throws `P2025` → returns 500 instead of 404): `contacts/[id]/route.ts:154`, `sequences/[id]/contacts/[contactId]/route.ts`.

---

## Goal

1. **Every** authenticated web route derives the caller's `userId` from the session (never from the request body or URL).
2. **Every** mutation that connects/sets related rows verifies those rows belong to the caller before connecting them.
3. No mass-assignment: every `update({ data })` uses an explicit allowlist of fields.
4. Auth is enforced via a single shared helper so the pattern can't drift.
5. Prisma `P2025` (not found) errors are translated to `404` rather than `500`.

---

## Implementation steps

### Step 1 — Create shared auth/authorization helpers

Create **`apps/web/src/lib/auth/access.ts`** with:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@coldjot/database";

/** Returns the authenticated user's id, or a 401 NextResponse. */
export async function requireAuth(): Promise<
  { userId: string } | NextResponse
> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { userId };
}

/** Type guard: did requireAuth() return a response (error) or a userId? */
export function isAuthError(
  r: { userId: string } | NextResponse
): r is NextResponse {
  return r instanceof NextResponse;
}
```

Then add **ownership-asserting helpers** for the resources that get connected. The key insight: when you `connect` a `Contact` to a list/sequence, you must scope the contact lookup by the caller's `userId`:

```ts
/**
 * Verifies ALL of the given contactIds belong to `userId`.
 * Returns the set of missing/foreign ids (empty if all valid).
 * Use this BEFORE any `connect`/`set` that references contact ids.
 */
export async function findForeignContactIds(
  userId: string,
  contactIds: string[]
): Promise<Set<string>> {
  if (contactIds.length === 0) return new Set();
  const owned = await prisma.contact.findMany({
    where: { id: { in: contactIds }, userId },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map((c) => c.id));
  return new Set(contactIds.filter((id) => !ownedSet.has(id)));
}
```

> **Pattern to repeat** for any resource that gets connected (`Template`, `Mailbox`, etc.): a `findForeignXIds(userId, ids[])` helper.

### Step 2 — Fix IDOR #1: `lists/[id]/route.ts` PATCH

**Before** (the dangerous connect):
```ts
data: {
  contacts: { set: contacts.map((id: string) => ({ id })) },
}
```

**After:**
```ts
// 1. Validate input (see plan 04 for the zod schema; minimal version here):
if (!Array.isArray(contacts)) return NextResponse.json({ error: "Invalid contacts" }, { status: 400 });

// 2. Verify ALL contacts belong to the user BEFORE re-pointing:
const foreign = await findForeignContactIds(session.user.id, contacts);
if (foreign.size > 0) {
  return NextResponse.json(
    { error: "Some contacts do not belong to this account" },
    { status: 403 }
  );
}

// 3. Now safe to set:
data: {
  contacts: { set: contacts.map((id: string) => ({ id })) },
}
```

### Step 3 — Fix IDOR #2: `lists/[id]/contacts/route.ts` (POST, PUT, DELETE)

Apply the same `findForeignContactIds` check before every `connect`/`set`:

- **POST** (~L116): before `connect: { id: contactId }`, verify the contact exists with `where: { id: contactId, userId }`. If not found → `404`.
- **PUT** (~L295): before `contactsToAdd.map(id => ({ id }))`, run `findForeignContactIds` over the full array; reject if any are foreign.
- **DELETE** (~L383): same check over `contactIds` before `set`.

For single-contact operations, prefer a scoped lookup that doubles as the ownership check:
```ts
const contact = await prisma.contact.findUnique({
  where: { id: contactId, userId },  // ← compound; won't match foreign rows
});
if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
```

> Note: `Contact` has a composite unique on `(userId, email)` but `id` is the PK. `findUnique({ where: { id, userId } })` works because Prisma allows additional unique fields alongside the PK in a `where` — but `userId` here is a non-unique filter, so use `findFirst` if `findUnique` complains. Verify against your Prisma version.

### Step 4 — Fix IDOR #3: `sequences/[id]/contacts/route.ts` POST

Before the `sequenceContact.create` at ~L157, add:
```ts
const ownsContact = await prisma.contact.findFirst({
  where: { id: contactId, userId: session.user.id },
  select: { id: true },
});
if (!ownsContact) {
  return NextResponse.json({ error: "Contact not found" }, { status: 404 });
}
```

### Step 5 — Fix mass-assignment #4: `sequences/[id]/steps/[stepId]/route.ts` PUT

**Replace** the raw-spread:
```ts
// DANGEROUS — do not do this:
const json = await req.json();
const { sequenceId, type, ...updateData } = json;
await prisma.sequenceStep.update({ where: {...}, data: updateData });
```

**With** an explicit allowlist:
```ts
const json = await req.json();

// Allowlist every field the client may set:
const allowedFields = ["subject", "content", "body", "waitDays", "waitHours"] as const;
const updateData: Record<string, unknown> = {};
for (const key of allowedFields) {
  if (key in json) updateData[key] = json[key];
}

await prisma.sequenceStep.update({
  where: { id: stepId, sequenceId: id },  // keep the ownership scope
  data: updateData,
});
```

Even better, move this to a zod schema (plan 04) — but the allowlist is the minimum fix.

### Step 6 — Fix `admin/users/[id]/route.ts`

1. Replace `import { prisma } from "@/lib/prisma"` with `import { prisma } from "@coldjot/database"` (single source of truth).
2. Replace `where: { email: session.user.email! }` with an explicit null check:
   ```ts
   if (!session.user.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
   const admin = await prisma.user.findUnique({ where: { email: session.user.email } });
   ```
3. Wrap the handler in `try/catch` and translate Prisma `P2025` to `404`.

### Step 7 — Normalize all `requireAuth()` call sites

Refactor every route handler to start with:
```ts
const authResult = await requireAuth();
if (isAuthError(authResult)) return authResult;
const { userId } = authResult;
```
This replaces the three inconsistent `if (!session)` / `if (!session?.user?.id)` patterns. Do a repo-wide pass; the routes are listed in plan 04's "files to touch" — they overlap heavily.

### Step 8 — Translate Prisma `P2025` → 404

Add a tiny helper in `lib/auth/access.ts` (or `lib/db/errors.ts`):

```ts
import { Prisma } from "@prisma/client";

export function isNotFound(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025";
}
```

In each `catch (error)` block:
```ts
} catch (error) {
  if (isNotFound(error)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  console.error("[ROUTE]", error);
  return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
}
```

---

## Files to touch

**Create:**
- `apps/web/src/lib/auth/access.ts` (helpers)

**Modify (IDOR/mass-assignment fixes):**
- `apps/web/src/app/api/lists/[id]/route.ts`
- `apps/web/src/app/api/lists/[id]/contacts/route.ts`
- `apps/web/src/app/api/sequences/[id]/contacts/route.ts`
- `apps/web/src/app/api/sequences/[id]/steps/[stepId]/route.ts`
- `apps/web/src/app/api/admin/users/[id]/route.ts`

**Modify (auth-normalization sweep — best done alongside plan 04):**
- Every file in `apps/web/src/app/api/**/route.ts` that does `const session = await auth()`.

---

## Verification

### Manual (per IDOR)

For each IDOR, test with two accounts (User A and User B):

1. **Setup:** User A creates a contact `C_A`. User B logs in and obtains B's session cookie.
2. **Attack:** As User B, call the vulnerable endpoint referencing `C_A`'s id, e.g.:
   ```bash
   curl -X POST http://localhost:3000/api/lists/<B_LIST_ID>/contacts \
     -H "Cookie: <B_SESSION>" -H "Content-Type: application/json" \
     -d '{"contactId":"<C_A_ID>"}'
   ```
3. **Expected (after fix):** `403` or `404`. Before the fix: `200` and User A's contact is now linked to User B's list.

Repeat the same shape for: list PATCH (`/api/lists/<B_LIST>` with `contacts:["<C_A_ID>"]`), sequence contact add (`/api/sequences/<B_SEQ>/contacts`), step mass-assignment (`PUT /api/sequences/<B_SEQ>/steps/<stepId>` with `{"id":"<x>"}` or `{"sequenceId":"<x>"}` — should be ignored/ignored-and-unchanged).

### Automated

- Add an integration test per IDOR (see [`../testing/01-testing-baseline.md`](../testing/01-testing-baseline.md)) using two fake sessions asserting the foreign-id case returns 403/404.

### Lint/regression

- `npm run build` should pass.
- Grep to confirm no remaining raw `connect: { id: <body-derived-id> }` without a preceding ownership check:
  ```bash
  rg -n "connect:\s*\{\s*id:" apps/web/src/app/api
  ```

---

## Risks & rollback

- **Risk:** Over-strict ownership checks could break legitimate flows where a resource is genuinely shared (none identified in the schema — all ownership is single-user). Confirm there's no future "team" feature planned before locking down.
- **Risk:** Changing `findUnique({ where: { id, userId } })` semantics if Prisma rejects the compound — fall back to `findFirst`.
- **Rollback:** All changes are additive helpers + per-route guards; revert the commits per-file. No schema migration is required for this plan.
- **Backward compat:** The API contract becomes stricter (previously-200 attacks now 403/404). Legitimate clients are unaffected.
