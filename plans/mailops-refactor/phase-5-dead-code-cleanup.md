# Phase 5 — Delete Dead Code & Clean Up

> **Goal:** remove the leftover scaffolding, comment noise, dead files, and stray logs that survived Phases 1–4.
>
> **Branch:** `refactor/mailops-phase5` (off Phase 4 branch)
> **Estimated effort:** 0.5–1 day
> **Behavior change:** zero. Everything deleted here is unreachable or already replaced.

## Why this phase is separate

Phases 1–4 left things in place on purpose: stopgaps (`lib/tracking` standalone fns), barrel re-exports, backwards-compat shims, the `// TODO(phase-4c):` markers. Deleting them mid-refactor would have made diffs noisy and risked breaking imports that hadn't migrated yet. Now that all callers point at the new code, the scaffolding can go in one clean sweep.

## Step-by-step

### Step 5.1 — Delete orphaned / dead files

| File | Why it's dead |
|---|---|
| `services/init.ts` (55 lines) | Orphaned — `server.ts` calls `createServiceManager()` directly, never imports this. Confirmed by grep in Phase 0. |
| `services/jobs/thread-watch/processor.ts` (846 lines) | Was commented out in `service-manager.ts:174-175`. Phase 4c either absorbs the concept into `PollingInboxSource` (option a) or deletes it (option b, recommended). If (a): keep the moved file; if (b): delete the original now. |
| `services/watch/debug.ts` (330 lines) | Dev-only watch debugging. Grep callers — if zero in production paths, delete. If used for local debugging, move to `scripts/` and out of `src/`. |
| `lib/google/index.ts`, `lib/google/gmail.ts`, `lib/google/helper.ts` | Barrel/re-export shims. After Phase 4b/4c, callers import directly from `adapters/gmail-transport.ts` / `adapters/gmail-inbox-source.ts`. Delete the shims once grep confirms zero importers. |

**Verify per file:** `grep -rn "<file basename>" apps/mailops/src --include='*.ts'` returns zero non-self references before deletion. `tsc` stays green.

### Step 5.2 — Remove comment noise

- The long runs of `// -----------------------------------------` separators throughout the old code (`lib/email/index.ts:33-35,39-41`, `services/pubsub/handler.ts:97-99,113-115`, etc.). Most are gone after Phase 4's rewrites; sweep any survivors.
- `// TODO: Remove this if possible` + the `createServiceManager` factory at `service-manager.ts:293-297` — this is the Phase 6 target. Leave it for Phase 6 (which deletes the whole singleton). Don't half-fix here.
- `// TODO : Check the code again`, `// TODO : Get sender info using accessToken like SMTP version - Recheck` (lib/email) — gone with Phase 4b.
- Commented-out trailing duplicate exports in `services/watch/index.ts` (~lines 389-421). Delete.

### Step 5.3 — Consolidate logging

After Phase 4, `console.log` / `console.error` should be gone from the three god-objects. Sweep the rest:

```
grep -rn "console\.\(log\|error\|warn\)" apps/mailops/src
```

Every match should either:
- become a `logger.info` / `logger.error` / `logger.warn` call (object-first form, matching refactor-plan 09's pino convention), or
- be deleted (leftover debugging).

Known survivors from Phase 0: `services/jobs/email/processor.ts:129` (`console.log("🔍 Fetching mailbox info with data", data)` — this logs `EmailJob` PII; **delete, don't convert**).

### Step 5.4 — Remove unused private methods + stray statements

From Phase 4 these should already be gone, but sweep:
- Stray `null;` statement (was `lib/email/index.ts:134`) — gone with Phase 4b.
- Unused `createEmailTrackingRecord` (was `lib/email/index.ts:294`) — gone with Phase 4b.
- Any `validateEmailData`-style private methods with zero callers (`services/jobs/email/processor.ts:286` defines `validateEmailData` but it's never called — confirm and delete).

### Step 5.5 — Remove the tracking stopgap

Phase 3 introduced a module-level singleton binding (`_setTrackingRepo`, `_setTrackingRepos`) in `lib/tracking/index.ts` to bridge the standalone-function era. Phase 4a deleted those standalone functions. Delete the stopgap setters now — `lib/tracking/index.ts` should be a clean barrel:

```ts
// lib/tracking/index.ts
export { generateTrackingPixel } from "./pixel";
export { addTrackingToEmail, wrapLinksWithTracking } from "./link-wrap";
export { calculateRates } from "./stats";
export { TrackingServiceImpl } from "@/services/domain/tracking.service";
```

### Step 5.6 — Sweep `any` types introduced during the refactor

ESLint config has `@typescript-eslint/no-explicit-any` at `error`. Any `any` added as a quick cast during Phases 2–4 (e.g. `metadata?: any` in the old `trackEmailEvent`) gets a real type now. Pull the matching type from `@coldjot/types`.

### Step 5.7 — Dependency cleanup

Re-run `npm ls` (or check `package.json`) for deps that are no longer imported:
- `nodemailer` — removed in Phase 4b.
- `quoted-printable` — used only by the SMTP helper. If Phase 4b deleted SMTP, this is now unused. Remove.
- Any others — grep each dep's package name across `src/` before removing.

## Definition of done

- [ ] Every file listed in 5.1 is deleted (or relocated to `scripts/` with justification).
- [ ] `grep -rn "console\." apps/mailops/src` returns zero matches (or only intentional ones with a `// intentional` comment).
- [ ] `grep -rn "// -----" apps/mailops/src` returns zero matches.
- [ ] `grep -rn "any" apps/mailops/src --include='*.ts'` returns only `any` inside type imports from third-party packages.
- [ ] No commented-out code blocks anywhere in `src/`.
- [ ] Unused devDependencies removed.
- [ ] `tsc --noEmit` clean; ESLint clean; Phase 0 characterization tests pass.
- [ ] `server.ts` still boots; HTTP contract unchanged.

## What to commit

- "phase 5.1: delete orphaned files"
- "phase 5.2: remove comment-separator noise"
- "phase 5.3: replace console.log with logger (or delete PII logs)"
- "phase 5.4-5.6: remove unused methods, stopgaps, and any-types"
- "phase 5.7: remove unused dependencies"

## Risks

| Risk | Mitigation |
|---|---|
| A "dead" file is actually imported somewhere surprising | Grep before deleting. If grep finds a caller, don't delete — migrate the caller first or leave the file with a `// FIXME(phase-6):` comment. |
| Removing a dep breaks something at runtime even though tsc is clean | Some deps are peer/runtime-only (not statically imported). Check `import` AND `require` AND any `tsx`/`tsup` config references before removing. |
