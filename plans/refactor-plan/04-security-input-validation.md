# Plan 04 — Introduce zod Validation Across All API Routes & Server Actions

> **Severity:** 🔴 HIGH
> **Effort:** Medium (1–2 days)
> **Depends on:** Plan 01 (the `requireAuth` helper). Build the shared validation package at the same time as the auth helpers.

---

## Problem

**No zod validation exists anywhere in the web API layer.** Bodies are destructured raw from `req.json()` in every route, and the few zod schemas that do exist are isolated to two sequence routes. The result:

- Invalid JSON throws `SyntaxError` → 500 instead of 400.
- Missing fields produce malformed data (`"undefined undefined"` as a contact name).
- Type-unsafe: `req.json()` returns `any`, and routes spread it into Prisma writes.
- No shared contract between the client forms and the server — they can drift silently.

### Concrete evidence

| File | Line | Issue |
|---|---|---|
| `apps/web/src/app/api/contacts/route.ts` | ~73 | `const { firstName, lastName, email } = await req.json()` — no validation; missing email yields `"undefined undefined"` name |
| `apps/web/src/app/api/contacts/batch/route.ts` | ~15–22 | Validates `Array.isArray` + length cap (1000) but no per-element validation; a malformed element throws and aborts the whole batch |
| `apps/web/src/app/api/sequences/[id]/launch/route.ts` | ~19 | `const { testMode = false } = await req.json()` — `{"testMode": "yes"}` passes a truthy string |
| `apps/web/src/app/api/search/apollo/search/route.ts` | ~21–22 | `domain.replace(...)` with no null check → crashes 500 if `domain` missing |
| `apps/web/src/app/api/drafts/send/route.ts` | ~15 | `{ draftId } = await req.json()` unvalidated |
| `apps/web/src/app/api/lists/[id]/route.ts` | ~94 | `name, description, contacts, tags` destructured raw |
| `apps/web/src/app/api/lists/[id]/contacts/route.ts` | POST ~109, PUT ~217 | `contactId` / `contactIds` unvalidated |
| `apps/web/src/app/api/sequences/[id]/contacts/route.ts` | ~119 | `{ contactId } = await req.json()` unvalidated |
| `apps/web/src/app/api/sequences/[id]/steps/[stepId]/route.ts` | ~44–71 | Raw spread → mass-assignment (see plan 01) |
| `apps/mailops/src/routes/sequence/validator.ts` | 3–54 | Validators only check field *presence*, not *shape* |

### Positive exceptions (build on these)
- `apps/web/src/app/api/sequences/[id]/contacts/bulk/route.ts:4` and `.../list/route.ts:6` import zod schemas.
- `apps/web/src/env.ts` uses zod for env validation (though it's bypassed elsewhere — plan 11).

### Client-side
`react-hook-form` is used in ~7 components but `zodResolver` is wired in **only once** (`components/settings/profile-form.tsx:5,34`). Client schemas and server schemas are not shared.

---

## Goal

1. **One source of truth** for every request shape: a zod schema per endpoint, defined in a shared package importable by both web (server) and the client forms.
2. **Every** web API route and server action validates input with zod before touching Prisma.
3. **Every** mailops route validates body shape (not just presence).
4. Validation failures return **400** with a structured error, never 500.
5. Client forms reuse the same schemas via `zodResolver`, so client and server can't drift.

---

## Implementation steps

### Step 1 — Create a shared validation package

Decide where schemas live. Two reasonable options:

**Option A (lighter): add to `packages/types`** — it already exports shared TS types; add a `schemas/` subfolder. Pros: no new package; types and schemas live together.

**Option B (cleaner): new `packages/validation` package** — depends on `zod`, exports schemas, imported by web, mailops, and (transitively) client forms.

**Recommendation: Option A** to avoid a new package; zod is already a dependency of both apps. Create `packages/types/src/schemas/`.

Example layout:
```
packages/types/src/schemas/
  contact.ts          // createContactSchema, updateContactSchema, batchCreateContactsSchema
  list.ts             // createListSchema, updateListSchema, addContactsToListSchema
  sequence.ts         // launchSequenceSchema, addContactToSequenceSchema, updateStepSchema
  mailbox.ts          // ...
  draft.ts            // sendDraftSchema
  search.ts           // apolloSearchSchema
  common.ts           // paginationSchema, idParamSchema
```

Add re-exports to `packages/types/src/index.ts`.

### Step 2 — Write representative schemas

```ts
// packages/types/src/schemas/contact.ts
import { z } from "zod";

export const createContactSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(50).optional(),
  // ...only the fields the API actually accepts
});
export type CreateContactInput = z.infer<typeof createContactSchema>;

export const batchCreateContactsSchema = z.object({
  contacts: z.array(createContactSchema).min(1).max(1000),
});
```

```ts
// packages/types/src/schemas/sequence.ts
export const launchSequenceSchema = z.object({
  testMode: z.boolean().default(false),   // ← fixes the truthy-string bug
});

export const updateStepSchema = z.object({
  subject: z.string().max(200).optional(),
  content: z.string().optional(),
  body: z.string().optional(),
  waitDays: z.number().int().min(0).max(365).optional(),
  waitHours: z.number().int().min(0).max(23).optional(),
}).strict();   // ← .strict() rejects unknown keys → closes mass-assignment
```

```ts
// packages/types/src/schemas/common.ts
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20), // ← clamped!
  search: z.string().trim().optional(),
});
```

### Step 3 — Add a `parseBody` helper

In `apps/web/src/lib/http/validation.ts`:

```ts
import { NextResponse } from "next/server";
import type { ZodSchema, z } from "zod";

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

export async function parseBody<T>(
  req: Request,
  schema: ZodSchema<T>
): Promise<ParseResult<T>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten() },
        { status: 400 }
      ),
    };
  }
  return { ok: true, data: parsed.data };
}
```

### Step 4 — Refactor each route to use it

Combine with the auth helper from plan 01:

```ts
// apps/web/src/app/api/contacts/route.ts
import { createContactSchema } from "@coldjot/types";
import { requireAuth, isAuthError } from "@/lib/auth/access";
import { parseBody } from "@/lib/http/validation";

export async function POST(req: Request) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  const body = await parseBody(req, createContactSchema);
  if (!body.ok) return body.response;
  const { firstName, lastName, email } = body.data;

  // ...safe to write to Prisma now
}
```

For path params (`[id]`, `[stepId]`), validate with a small schema too:
```ts
const paramsSchema = z.object({ id: z.string().cuid() });
const { id } = paramsSchema.parse(await params);
```

### Step 5 — Pagination clamping

Any route reading `?page=` / `?limit=` should use `paginationSchema` (with `z.coerce.number()` and `.max(100)`). This fixes the unbounded-`limit` issue (`contacts/route.ts:14–15`).

### Step 6 — Wire client forms to the same schemas

In form components, replace ad-hoc `useForm<FormData>` with:

```ts
import { createContactSchema, type CreateContactInput } from "@coldjot/types";

const form = useForm<CreateContactInput>({
  resolver: zodResolver(createContactSchema),
});
```

This gives client-side validation that matches the server exactly.

### Step 7 — Tighten mailops validators

`apps/mailops/src/routes/sequence/validator.ts` currently checks presence only. Replace with zod schemas (import the same ones from `@coldjot/types` where the shapes overlap; mailops-specific schemas can live locally).

### Step 8 — Forbid unknown keys on writes

For every mutation schema that ends up in a Prisma `update`/`create`, append `.strict()` (or `.omit()`/`.pick()`) so extra fields are rejected rather than ignored. This is the structural fix for the mass-assignment in plan 01.

---

## Files to touch

**Create:**
- `packages/types/src/schemas/*.ts` (one file per domain)
- `apps/web/src/lib/http/validation.ts` (`parseBody`, `parseQuery`)

**Modify (web routes — replace raw destructuring with `parseBody`):**
- `apps/web/src/app/api/contacts/route.ts`
- `apps/web/src/app/api/contacts/[id]/route.ts`
- `apps/web/src/app/api/contacts/batch/route.ts`
- `apps/web/src/app/api/lists/route.ts`
- `apps/web/src/app/api/lists/[id]/route.ts`
- `apps/web/src/app/api/lists/[id]/contacts/route.ts`
- `apps/web/src/app/api/sequences/[id]/launch/route.ts`
- `apps/web/src/app/api/sequences/[id]/contacts/route.ts`
- `apps/web/src/app/api/sequences/[id]/steps/[stepId]/route.ts` (also fixes mass-assignment)
- `apps/web/src/app/api/sequences/[id]/contacts/bulk/route.ts`
- `apps/web/src/app/api/sequences/[id]/contacts/list/route.ts`
- `apps/web/src/app/api/mailboxes/[mailboxId]/route.ts`
- `apps/web/src/app/api/drafts/send/route.ts`
- `apps/web/src/app/api/search/apollo/search/route.ts`
- `apps/web/src/app/api/settings/email/route.ts`
- `apps/web/src/app/actions/contacts.ts`, `apps/web/src/app/actions/onboarding.ts` (server actions)

**Modify (mailops):**
- `apps/mailops/src/routes/sequence/validator.ts`
- `apps/mailops/src/routes/mailbox.ts`
- `apps/mailops/src/routes/lists/index.ts`

**Modify (client forms — adopt shared schemas via zodResolver):**
- `apps/web/src/components/contacts/add-contact-drawer.tsx`
- `apps/web/src/components/contacts/edit-contact-form.tsx`
- `apps/web/src/components/templates/add-template-drawer.tsx`
- `apps/web/src/components/settings/profile-form.tsx`
- (others using `useForm`)

---

## Verification

### Manual
- `POST /api/contacts` with `{ "firstName": "A" }` (missing email) → **400** with a structured `issues` object (previously: 500 or a malformed contact).
- `POST /api/contacts` with invalid JSON body → **400 "Invalid JSON"** (previously: 500).
- `PUT /api/sequences/<id>/steps/<stepId>` with an unknown field (`{"foo":"bar"}`) → **400** (mass-assignment closed).
- `GET /api/contacts?limit=99999` → **200** with `limit` clamped to 100 (inspect the SQL via dev logs).

### Automated
- Add a unit test per schema (zod schemas are pure functions — fast to test).
- Add a route-level integration test that posts an invalid body and asserts 400.

### Regression
- `npm run build` should pass.
- Existing client forms should keep working; if a form sends a field the new schema rejects, the form needs updating to match — this is the drift you want to surface.

---

## Risks & rollback

- **Backward-compat breaks:** legitimate clients that send extra fields will start getting 400. Use `.strip()` (silently drop unknowns) instead of `.strict()` for **read** endpoints, and `.strict()` only for **write** endpoints where mass-assignment is a risk. Alternatively, phase in `.strict()` after a warning period.
- **Schema drift from Prisma:** the zod schema must match what the route writes. Keep schemas close to the route or auto-generate from Prisma (`zod-prisma-types`) if drift becomes a maintenance burden.
- **Performance:** zod parsing on every request is fast (microseconds for these shapes) — not a concern.
- **Rollback:** schemas are additive; removing `parseBody` calls reverts behavior. No schema migration required.
