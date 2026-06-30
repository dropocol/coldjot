# Plan 07 — Consolidate the Frontend on a Single Data-Fetching Strategy

> **Severity:** 🟡 MEDIUM (architectural — affects every future feature)
> **Effort:** Large (incremental; 3–5 days to migrate the worst offenders)
> **Depends on:** Nothing. Pairs well with plan 04 (shared zod schemas) and plan 11 (centralized env/mailops client).

---

## Problem

The web app currently uses **three competing, uncoordinated data-fetching strategies**, and the one that's globally provisioned (react-query) is barely used. This causes duplicated loading/error state, no shared cache, manual refetches everywhere, and inconsistent UX.

### Evidence

| Strategy | Where | Usage |
|---|---|---|
| **Raw `fetch` + `useState`** | ~60 components | The dominant pattern. Every component hand-rolls loading/error state and re-fetches manually after every mutation. |
| **react-query** (`@tanstack/react-query` v5) | `providers/query-provider.tsx` wraps the whole app; `useQuery`/`useMutation` used in only **3 files**: `components/sequences/timeline/timeline-list.tsx`, `components/sequences/timeline/recent-emails.tsx`, `components/sequences/sequence-analytics.tsx`. Plus `timeline-section.tsx` uses `useQueryClient` for invalidation. | **~5% of data fetching.** Installed but essentially decorative. |
| **Server Actions** | `app/actions/contacts.ts`, `app/actions/onboarding.ts`, one inline in `components/login-form.tsx:17` | Minimal. |

### Concrete consequences

- **No cache, no dedup.** `sequence-overview.tsx` makes 5 separate `fetch()` calls to the same `/api/sequences/[id]/steps` endpoint across its handlers (lines 99, 166, 183, 201, 221, 235, 257, 269, 284, 293), each followed by a full re-fetch to sync local `useState`.
- **Inconsistent loading UX.** Some components show skeletons, some show spinners, some show nothing.
- **Stale data.** After a mutation in one component, sibling components showing related data don't refresh (no shared cache to invalidate).
- **~70% of components are `"use client"`** (137 of 196 `.tsx` files), including entire pages (`app/contacts/page.tsx`, `app/lists/[id]/page.tsx`, `app/sequences/sequences-page-client.tsx`). This forfeits Next.js server-component streaming and ships unnecessary JS.
- **`lib/sequence-context.tsx`** rolls its own context with `any` typing (`sequence: any`, etc.) and a `refreshSequence` that does a raw `fetch` — exactly what react-query replaces.

### The mailops client is also scattered

`apps/web/src/lib/queue/queue-api-client.ts` exists and is the cleanest mailops client, but several components call mailops directly via `fetch(${process.env.NEXT_PUBLIC_MAILOPS_API_URL}/...)`. Plan 03 (add service auth) and plan 11 (centralize) both depend on consolidating to one client.

---

## Goal

Pick **one** primary strategy and migrate to it. Two viable end-states:

**Option A — react-query everywhere (recommended for this codebase):**
- All client-side data fetching goes through react-query hooks.
- Mutations use `useMutation` + `queryClient.invalidateQueries` for cache consistency.
- A typed API client wraps `fetch` so every call includes auth, base URL, and error handling.
- Server Components still fetch directly where it improves initial load (no need to hydrate data that doesn't change).

**Option B — Server Components + Server Actions:**
- Pages become Server Components that fetch on the server.
- Mutations are Server Actions.
- react-query is used only for the few truly client-side interactions (optimistic updates, infinite scroll).

**Recommendation: Option A**, because the app is already heavily client-rendered and the team has already provisioned react-query. Migrating to Option B would be a larger rewrite. Option A is incremental — you can convert one component at a time.

Whichever you pick: **delete the other patterns** once migration is complete.

---

## Implementation steps (Option A — react-query)

### Step 1 — Create a typed API client

`apps/web/src/lib/http/api-client.ts`:

```ts
import { env } from "@/env"; // plan 11

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API error ${status}`);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env.NEXT_PUBLIC_APP_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include", // send the NextAuth session cookie
  });
  if (!res.ok) {
    throw new ApiError(res.status, await res.json().catch(() => null));
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
```

Similarly consolidate the mailops client into `apps/web/src/lib/queue/queue-api-client.ts` (already exists — extend it to cover all mailops calls and add the `X-Service-Token` header from plan 03).

### Step 2 — Establish query-key conventions

`apps/web/src/lib/query/keys.ts`:

```ts
export const qk = {
  contacts: {
    all: ["contacts"] as const,
    list: (params: { page: number; limit: number; search?: string }) =>
      ["contacts", "list", params] as const,
    detail: (id: string) => ["contacts", "detail", id] as const,
  },
  sequences: {
    all: ["sequences"] as const,
    detail: (id: string) => ["sequences", "detail", id] as const,
    steps: (id: string) => ["sequences", id, "steps"] as const,
    contacts: (id: string) => ["sequences", id, "contacts"] as const,
    timeline: (id: string) => ["sequences", id, "timeline"] as const,
  },
  // ...lists, mailboxes, templates
};
```

Hierarchical keys make targeted invalidation easy: `invalidateQueries({ queryKey: qk.sequences.all })` refreshes everything; `{ queryKey: qk.sequences.steps(id) }` refreshes just steps.

### Step 3 — Create reusable hooks per resource

`apps/web/src/hooks/queries/use-contacts.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/http/api-client";
import { qk } from "@/lib/query/keys";
import { createContactSchema } from "@coldjot/types"; // plan 04

export function useContacts(params: { page: number; limit: number; search?: string }) {
  return useQuery({
    queryKey: qk.contacts.list(params),
    queryFn: () => api.get<{ contacts: Contact[]; total: number }>(
      `/api/contacts?${new URLSearchParams(params as any)}`
    ),
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateContactInput) => api.post("/api/contacts", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.contacts.all }),
  });
}
```

### Step 4 — Migrate components incrementally

Order by pain (highest first — these are the worst offenders from plan 08):

1. `components/lists/list-details-view.tsx` (533 lines, 11+ `console.log`, many fetches)
2. `components/sequences/sequence-contacts.tsx` (528 lines)
3. `components/sequences/sequence-overview.tsx` (406 lines, 5 fetches to one endpoint)
4. `components/contacts/contact-list.tsx` (455 lines)
5. `app/contacts/page.tsx`, `app/lists/[id]/page.tsx`, `app/lists/page.tsx`

For each: replace `useEffect + fetch + useState` with the relevant `useX` hook. Mutations become `useMutation` with `onSuccess` invalidation.

### Step 5 — Convert key pages to Server Components where it pays off

Pages that just display data (`app/contacts/page.tsx`, `app/templates/page.tsx`) can become Server Components that fetch on the server and pass initial data to a client child via `hydrate`. This is optional but improves first paint. Don't force it — focus on react-query migration first.

### Step 6 — Delete the hand-rolled context

Once sequences use react-query, delete `lib/sequence-context.tsx` (or reduce it to non-data UI state like selected tab). Its data-fetching job is replaced by `useSequence(id)`.

### Step 7 — Standardize loading/error UI

Create `<QueryState>` wrappers:
```tsx
function QueryState<T>({ query, children }: { query: UseQueryResult<T>; children: (data: T) => ReactNode }) {
  if (query.isLoading) return <Skeleton />;
  if (query.isError) return <ErrorState error={query.error} />;
  return <>{children(query.data!)}</>;
}
```
Use everywhere for consistent UX.

### Step 8 — Configure react-query defaults

In `providers/query-provider.tsx`:
```tsx
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,       // 30s before refetch on focus
      retry: 1,
      refetchOnWindowFocus: false, // or true, per product preference
    },
  },
})
```

---

## Files to touch

**Create:**
- `apps/web/src/lib/http/api-client.ts`
- `apps/web/src/lib/query/keys.ts`
- `apps/web/src/hooks/queries/use-contacts.ts`, `use-lists.ts`, `use-sequences.ts`, `use-mailboxes.ts`, `use-templates.ts`, `use-timeline.ts`
- `apps/web/src/components/shared/query-state.tsx` (loading/error wrapper)

**Modify (migrate to hooks):**
- `components/lists/list-details-view.tsx`
- `components/sequences/sequence-contacts.tsx`
- `components/sequences/sequence-overview.tsx`
- `components/contacts/contact-list.tsx`
- `components/contacts/add-to-sequence-modal.tsx`
- `components/sequences/sequence-lists.tsx`
- `components/compose/email-composer.tsx`
- `app/contacts/page.tsx`, `app/lists/page.tsx`, `app/lists/[id]/page.tsx`, `app/templates/page.tsx`, `app/search/page.tsx`
- `providers/query-provider.tsx` (defaults)

**Delete (after migration):**
- `lib/sequence-context.tsx` (or trim to UI-only state)

**Extend:**
- `apps/web/src/lib/queue/queue-api-client.ts` (add service-token header, cover all mailops routes)

---

## Verification

### Per-component
- The migrated component renders the same data as before.
- After a mutation (e.g. add contact to list), the list updates **without a manual refetch** and without a full page reload.
- Sibling components showing related data refresh (cache invalidation works).
- Loading and error states render consistently.

### Cache behavior
- Open devtools → react-query Devtools (`<ReactQueryDevtools />` — add temporarily). Confirm queries are deduped (one network request per key even with multiple subscribers).

### Bundle / performance
- Compare Lighthouse / Next.js build output before and after for migrated pages. Client JS should not grow significantly (react-query is already bundled).

### Regression
- All existing user flows still work. `npm run build` passes.

---

## Risks & rollback

- **Migration is incremental** — you can ship one component at a time, so risk is bounded per PR.
- **react-query cache can show stale data** if invalidation keys are wrong. Use the hierarchical `qk` conventions and lean on broad invalidation (`qk.contacts.all`) until you're confident.
- **Server-action vs react-query split** — decide explicitly per feature to avoid both being used for the same mutation. Document the rule.
- **`credentials: "include"`** is required for the session cookie to be sent — verify in the deployed environment (cross-origin needs CORS configured on Next, which it is by default for same-origin).
- **Rollback:** revert the migrated component to its `fetch`+`useState` version. The hooks and client are additive.
