# Plan 08 — Frontend Code Quality: Logging, Types, Dead Code, Lint

> **Severity:** 🟡 MEDIUM
> **Effort:** Medium (1–2 days, mostly mechanical)
> **Depends on:** Nothing. Pairs with plan 07 (rewrite files during migration) and plan 09 (shared logger).

---

## Problem

Five compounding quality issues make the frontend harder to maintain and, in a few cases, leak sensitive data.

### 1. `console.log` everywhere — including OAuth tokens

**138 `console.log` statements; 341 total `console.*`** across ~117 files. Worst offenders:

| File | Lines | What's logged |
|---|---|---|
| `app/api/mailboxes/gmail/callback/route.ts` | 62, 80, 88, 110, 122, 127, 147, 182, 204, 212 | **OAuth tokens and user info** (line 122: `console.log("Tokens:", tokens)` logs the full token set including `access_token`, `refresh_token`, `id_token`) — **security-relevant** |
| `components/lists/list-details-view.tsx` | 206, 211, 212, 216, 219, 231, 239, 240, 243, 296, 297 | Contact objects and modal state |
| `app/api/sequences/[id]/duplicate/route.ts` | 12–98 | 8 statements with `[SEQUENCE_DUPLICATE]` prefix |
| `app/contacts/page.tsx` | 50, 57, 61, 68, 74, 80, 81, 91 | Modal-flow debugging |
| `app/lists/[id]/page.tsx` | 35, 78, 85, 89, 95, 99, 105, 109, 113, 114, 123, 124, 127 | Page lifecycle |
| `app/api/mailboxes/gmail/auth/route.ts` | 30, 50, 56, 70 | OAuth config |

The Gmail callback logging tokens is a **security issue**, not just hygiene — see plan 02/09.

### 2. `any` types defeat TypeScript safety

**73 occurrences across 43 files.** Concentrations:

| File | Lines | Issue |
|---|---|---|
| `lib/sequence-context.tsx` | 15, 16, 36, 48, 49 | The entire context typed `any` (`sequence: any`, `updateSequence: (newData: any) => void`, `initialSequence: any`) |
| `lib/client-actions.ts` | 50, 84, 160 | Action payloads typed `any` |
| `app/api/sequences/[id]/timeline/route.ts` and `app/api/timeline/route.ts` | — | `transformEmailData(email: any)` + 5+ internal `any` casts each; **duplicated logic** |
| `components/sequences/sequence-overview.tsx` | 177, 216 | Save handlers `(data: any)` |
| `components/stats/stats-chart.tsx` | 40, 53 | Recharts tooltip `any` |

The codebase also disables the ESLint rules that would catch these (see #5).

### 3. Dead / legacy code

- `components/editor-old/rich-text-editor.tsx` — full legacy editor, unused.
- `components/ui/backup/` — empty directory, leftover scaffolding.
- `lib/hooks/use-debounce.ts` **and** `hooks/use-debounce.ts` — duplicate debounce hooks.
- Commented-out mock in `sequence-overview.tsx:324–341` (hardcoded fake stats).
- Commented-out code block in `drafts/send/route.ts:71–81`.

### 4. Explicitly-broken code flagged by TODOs

**11 TODO/FIXME/HACK comments.** Two are explicitly "not working":

| File | Line | Comment |
|---|---|---|
| `app/api/sequences/[id]/steps/[stepId]/route.ts` | 80, 115 | `// TODO: reset order of steps after a deletion` and `// TODO: this is not working` — **deleting a step leaves gaps in `order`** |
| `app/api/sequences/[id]/stats/route.ts` | 67 | `// TODO: Fix it as we have removed status from sequence step` — **stale/broken stats logic** |
| `components/sequences/timeline/timeline-filters.tsx` | 72 | `// TODO: Confirm if these filters are working` — **feature correctness uncertain** |
| `lib/ip-location.ts` | 9 | `// TODO: Implement actual IP geolocation service` — **stub** (see plan 05) |
| `app/api/sequences/[id]/launch/route.ts` | 34 | `// TODO: Update enum` — status filter uses raw strings |
| `app/api/drafts/route.ts` | 17, 80 | Two TODOs |
| `app/api/sequences/[id]/steps/reorder/route.ts` | 31 | `// TODO: check order + 1 if needed` |
| `app/api/sequences/[id]/duplicate/route.ts` | 6 | `// TODO: improve the codebase` |
| `env.ts` | 4 | `// TODO: check if this is needed` (`dotenv.config()`) |

### 5. ESLint safety rules are disabled

`apps/web/.eslintrc.json` turns off:
```json
"@typescript-eslint/no-explicit-any": "off",
"@typescript-eslint/no-unused-vars": "off",
"react-hooks/rules-of-hooks": "off",
"react-hooks/exhaustive-deps": "off",
"@next/next/no-async-client-component": "off",
"prefer-const": "off"
```
Disabling `rules-of-hooks` and `exhaustive-deps` is especially dangerous — those catch real bugs.

### 6. Files > 400 lines

13 files exceed 400 lines (see plan 07 for the full list). Largest: `list-details-view.tsx` (533), `sequence-contacts.tsx` (528), `sequence-email-editor.tsx` (487).

### 7. Toast library inconsistency

**44 imports of `react-hot-toast`** vs **26 of shadcn `useToast`** — sometimes within the same feature folder. Pick one.

### 8. Naming / organization

- PascalCase files mixed with kebab-case (`Sidebar.tsx`, `GlobalSearch.tsx` vs everything else).
- `lib/sequence-context.tsx` is a React context living in `lib/` rather than `providers/`.

---

## Goal

1. No `console.log` in production code; sensitive data (tokens, PII) never logged at any level.
2. `any` eliminated or reduced to a small allowlist with justification.
3. Dead code deleted; duplicates merged.
4. Every "not working" TODO either fixed or filed as a tracked issue with the comment updated.
5. ESLint enforces the safety rules (warn first, then error).
6. One toast library, consistent file naming, oversized files split.

---

## Implementation steps

### Step 1 — Introduce a structured logger (do this first)

Create `apps/web/src/lib/logger.ts`:

```ts
const isDev = process.env.NODE_ENV !== "production";

/**
 * Use instead of console.log. Strips sensitive keys and is silent in prod
 * unless level is "error" / "warn".
 */
export const logger = {
  debug: (...args: unknown[]) => { if (isDev) console.debug(...redact(args)); },
  info:  (...args: unknown[]) => { if (isDev) console.info(...redact(args)); },
  warn:  (...args: unknown[]) => console.warn(...redact(args)),
  error: (...args: unknown[]) => console.error(...redact(args)),
};
```

`redact()` deep-replaces known-sensitive keys (`access_token`, `refresh_token`, `id_token`, `password`, `secret`, `authorization`, `cookie`) with `"[REDACTED]"`. (Share this implementation with mailops — see plan 09.)

### Step 2 — Replace `console.*` and delete sensitive logs

- **`app/api/mailboxes/gmail/callback/route.ts`**: delete the token/userinfo logs entirely (lines 122, 127, 147). These have no debugging value worth the security risk. Replace remaining operational logs with `logger.info`.
- **All other files**: mechanical replacement `console.log` → `logger.debug` (or delete if it's clearly leftover debugging).

A codemod-style find/replace works for most:
```bash
# In each file, replace console.log with logger.debug (after importing logger)
```

After replacement, **grep to confirm zero remaining `console.log`** in `apps/web/src`:
```bash
rg -n "console\.(log|debug|info)" apps/web/src
```

### Step 3 — Eliminate `any`

Order: fix the high-leverage ones first (the ones that propagate).

1. **`lib/sequence-context.tsx`** — type the context properly using `Sequence` from `@coldjot/database` (or `@coldjot/types`). If the sequence shape is partial during editing, use `Partial<Sequence>` or a dedicated `SequenceDraft` type.
2. **`lib/client-actions.ts`** — type payloads with the zod-inferred types from plan 04.
3. **`app/api/sequences/[id]/timeline/route.ts`** and `app/api/timeline/route.ts` — extract the duplicated `transformEmailData` into `apps/web/src/lib/email/transform.ts` with proper types; import from both routes.
4. **`components/sequences/sequence-overview.tsx:177,216`** — type save handlers with the step schema.
5. **`catch (error: any)`** blocks — replace with `catch (error)` + `error instanceof Error` narrowing, or a typed `ApiError` from plan 07.

For remaining one-off `any`s (recharts tooltips, etc.), use `unknown` + a narrowing function, or a narrowly-scoped `// eslint-disable-next-line` with a comment explaining why.

### Step 4 — Delete dead code

```bash
rm -rf apps/web/src/components/editor-old
rm -rf apps/web/src/components/ui/backup
rm apps/web/src/lib/hooks/use-debounce.ts   # keep the one in src/hooks/
```
Then grep to confirm nothing imports the deleted paths:
```bash
rg -n "editor-old|ui/backup|lib/hooks/use-debounce" apps/web/src
```
Remove the commented-out mock in `sequence-overview.tsx:324–341` and the commented block in `drafts/send/route.ts:71–81`.

### Step 5 — Fix or file the broken TODOs

| TODO | Action |
|---|---|
| `steps/[stepId]/route.ts:115` "this is not working" (step reordering) | **Fix:** after deleting a step, run an update that re-numbers `order` for the remaining steps in the same sequence. Or use the existing `/api/sequences/[id]/steps/reorder` endpoint. Add a test. |
| `stats/route.ts:67` "removed status from sequence step" | **Fix or file:** audit the stats query; if it references a removed field, rewrite it. Verify stats UI still shows correct numbers. |
| `timeline-filters.tsx:72` "Confirm if these filters are working" | **Verify:** manually test each filter against real data; if broken, fix; if working, delete the TODO. |
| `ip-location.ts:9` | Handled by plan 05. |
| Others | Convert to tracked issues (GitHub) and update the comment with the issue number, or resolve. |

### Step 6 — Re-enable ESLint rules (phased)

Don't flip everything to `error` at once — the build will explode. Phase it:

**Phase 1 (warn):**
```json
"@typescript-eslint/no-explicit-any": "warn",
"@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
"prefer-const": "warn",
"react-hooks/exhaustive-deps": "warn"
```
Keep `react-hooks/rules-of-hooks` as `error` — it's a correctness rule, never a warning.

**Phase 2 (error)** after the `any`/unused-vars cleanup completes:
```json
"@typescript-eslint/no-explicit-any": "error",
"@typescript-eslint/no-unused-vars": "error",
"prefer-const": "error",
"react-hooks/exhaustive-deps": "error"
```

`no-async-client-component` can stay off if you have legitimate async client components, but audit those — they're usually a mistake.

### Step 7 — Pick one toast library

**Recommendation: standardize on shadcn `useToast`** (it's already part of the design system and styled consistently). Migrate the 44 `react-hot-toast` call sites:
```ts
// before
import toast from "react-hot-toast";
toast.success("Saved");
// after
const { toast } = useToast();
toast({ title: "Saved" });
```
Then remove `react-hot-toast` from `package.json`.

(If the team prefers `react-hot-toast`'s API, go the other way — just pick one.)

### Step 8 — Split oversized files

During the plan-07 migration, the worst offenders get rewritten anyway. For any that remain > 400 lines after that, split by concern:
- `list-details-view.tsx` → `list-details-view.tsx` + `list-contacts-panel.tsx` + `list-sync-panel.tsx`
- `sequence-contacts.tsx` → split the table, the filters, and the add-contact drawer into separate files.

### Step 9 — Naming / organization tidy

- Move `lib/sequence-context.tsx` → `providers/sequence-provider.tsx` (if it survives plan 07).
- Enforce kebab-case filenames via an ESLint plugin (`eslint-plugin-filenames`) or a simple convention in `.cursorrules`/CONTRIBUTING.

---

## Files to touch

**Create:**
- `apps/web/src/lib/logger.ts`
- `apps/web/src/lib/email/transform.ts` (extracted `transformEmailData`)

**Delete:**
- `apps/web/src/components/editor-old/`
- `apps/web/src/components/ui/backup/`
- One of the duplicate `use-debounce.ts` files

**Modify (mechanical):**
- Every file with `console.log` (117 files) — replace with `logger` or delete
- Every file with `any` (43 files) — type properly
- `apps/web/.eslintrc.json` — phased rule changes
- All `react-hot-toast` import sites → `useToast` (or vice versa)
- Files with broken TODOs (fix logic)
- Oversized files (split)

---

## Verification

- `rg -n "console\.(log|debug|info)" apps/web/src` returns nothing (or only `logger.ts` internals).
- `rg -n ": any" apps/web/src` returns a small, justified set (target: < 10, all with explanatory comments).
- `rg -n "editor-old|ui/backup" apps/web/src` returns nothing.
- `npm run lint` passes with the new rule set (after Phase 2).
- `npm run build` passes.
- Manually verify the step-delete reordering works (delete step 2 of 4; remaining steps should be numbered 1, 2, 3, not 1, 3, 4).
- Manually verify sequence stats render correct numbers after the stats-route fix.

---

## Risks & rollback

- **Phased lint rollout:** if Phase 2 (`error`) blocks PRs unexpectedly, keep it at `warn` longer — but don't let it stall forever.
- **Toast migration** could subtly change UX (shadcn toasts are styled differently). Do a visual pass after migration.
- **Logger redaction:** if a sensitive key is missing from the redaction list, it still leaks. Maintain the list; consider a deny-by-default approach (only allow known-safe keys).
- **`rules-of-hooks` as error** may surface pre-existing hook violations — those are real bugs; fix them rather than re-disabling.
- **Rollback:** all changes are file-by-file; revert per commit. The logger is additive.
