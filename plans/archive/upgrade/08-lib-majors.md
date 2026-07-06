# Step 8 — `upgrade/lib-majors` (library majors with API changes)

> Branch: `upgrade/lib-majors` off the merged `upgrade/smtp-ai-minors` (Step 7).
> Final step: cross the library majors that carry **API changes** (not just version bumps). These surfaced during Step 5 as peer-dep conflicts blocking a clean `npm install`.

## Goal
Bring the remaining "code-touching" library majors to current, with the necessary source changes each requires. These can't be silent version bumps — each changes a consumer API.

## Why this step exists

During Step 5 (Next 16), a clean `npm install` failed with a peer-dep conflict:
```
react-day-picker@8.10.2  peer → date-fns ^2.28.0 || ^3.0.0
found: date-fns@4.4.0
```
`react-day-picker@8` is incompatible with `date-fns@4` (already on v4 since Step 0). The project was previously installing with a lockfile pin + effectively `--legacy-peer-deps`. To run **truly latest with a clean install**, react-day-picker must cross to **v9**, which is a breaking API change.

This step collects all such library majors so they're done deliberately, with code changes + verification, rather than masked by `--legacy-peer-deps`.

## Changes

### 1. `react-day-picker` 8 → 9 (apps/web) — the main one
- `apps/web/package.json`: `react-day-picker ^8.10.1` → `^9` (latest).
- v9 drops the `date-fns` peer (good — resolves the conflict) and is React 16.8+ compatible (works with React 19).
- **Breaking API changes to handle** (audit consumer components first):
  - The `DayPicker` component's props changed: `selected` semantics, `mode` is more strictly typed, `defaultMonth` → `month`/`defaultMonth`, `fromDate`/`toDate` still supported.
  - CSS import path changed: `import "react-day-picker/style.css"` (was `react-day-picker/dist/style.css`).
  - Some formatters/captions APIs changed.
- **Consumer audit:** grep `rg "react-day-picker" apps/web/src` — find every calendar/date-picker component (likely in `components/ui/calendar.tsx` or similar) and update props + CSS import to v9.
- After bumping, `npm install` should resolve cleanly **without** `--legacy-peer-deps`.

### 2. Other peer-conflict / library majors (audit + bump as they surface)
Run `npm install` (no `--legacy-peer-deps`) after react-day-picker; if more peer conflicts block the install, bump those libraries too. Likely candidates to verify-then-bump:
- `geist` — peers `next >=13.2.0` (tolerates 16, but check if a newer geist aligns better).
- `@hello-pangea/dnd` — on `^18.0.0-beta.0`; check if a stable release exists.
- `next-auth` — already bumped to `5.0.0-beta.31` in Step 5.
- `@lexical/*` (10 packages @ 0.25.x) — check for a newer 0.x or a 1.x.
- `@tiptap/*` (4 packages @ 2.9.x) — check for v3 (kept for now; consolidation is Plan 11).

### 3. Remove `--legacy-peer-deps` reliance
The end state of this step: `npm install` (no flags) succeeds. If any peer conflict genuinely can't be resolved without a code-touching major, document it and either:
- bump it here (with code changes), or
- add a surgical `overrides`/`peerDependencies` entry in root `package.json` with a clear comment.

## Verification
1. `npm install` (no flags) succeeds — the defining success criterion for this step.
2. `npm ls react-day-picker` shows a single v9 install.
3. `tsc --noEmit` passes in web.
4. `npm run build` (web) succeeds.
5. `npm run lint` passes.
6. **Runtime visual smoke** of every calendar/date-picker UI — verify the v9 picker renders, selects, and disables dates correctly. This is the highest-regression-risk part of the step.
7. Full runtime smoke of both apps (auth, dashboard, sequence CRUD, tracking).

## Risks & rollback
- **react-day-picker v9 API drift** is the main risk — the calendar component may need prop/CSS rewrites. Audit the consumer before bumping.
- If v9 proves too invasive, the fallback is to pin `react-day-picker@8` + `date-fns@3` (downgrade date-fns from 4) and document why — but this contradicts "everything current", so prefer the v9 migration.
- Rollback: revert the commit; restore the lockfile.
