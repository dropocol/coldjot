# 4 — Verify + commit

> **Goal:** run the full gate, confirm the refactor is complete, and finalize
> commits on `refactor/mailops-v2`.
>
> **Status:** ⬜ Not started · 🟡 In progress · ✅ Done — _(update STATUS.md when you flip this)_

## Prerequisite

Sub-plans 0–3 complete. The repository layer is gone; all consumers use `db: Db`.

## Full gate

```bash
cd "/Volumes/Data/00-My Projects/ColdJot/coldjot"

# Type + lint
npm run -w mailops typecheck
npm run -w mailops lint

# Fast tier (pure helpers — should be unchanged from pre-refactor)
npm run -w mailops test

# Integration tier (now carries domain-service coverage too)
npm run -w mailops test:integration
```

All four must pass. The fast-tier count should be ~46 (pure helpers only) —
down from ~159, because the ~24 domain-service unit tests moved to integration.
The integration-tier count should be up by roughly that amount.

## Completeness checks

```bash
cd "/Volumes/Data/00-My Projects/ColdJot/coldjot/apps/mailops"

# 1. No repo imports remain anywhere
grep -r "@/repositories" src/
# Expected: no output

# 2. No Prisma*Repository class references
grep -r "Prisma.*Repository" src/ --include="*.ts"
# Expected: no output

# 3. No XRepository type references (allow word "Repository" in comments)
grep -rn "implements.*Repository\|: [A-Z][a-z]*Repository\b" src/ --include="*.ts"
# Expected: no output

# 4. Repository directories gone
ls src/repositories 2>/dev/null            # Expected: no such directory
ls src/__tests__/repositories 2>/dev/null  # Expected: no such directory

# 5. File count check
find src -name "*.ts" -not -path "*__tests__*" | wc -l
# Expected: ~90 (down from 126)

# 6. Db type exported
grep -r "export type Db" ../packages/database/src/index.ts
# Expected: matches
```

## What should be true at the end

- Every service/controller that queries the DB takes `db: Db` (or for lib
  helpers, `db` as the first param).
- The composition root constructs services with `prisma` (the singleton) — no
  repo instantiation.
- Domain-service tests live in `__tests__/integration/` and use real Postgres.
- Pure-helper unit tests (`__tests__/unit/lib/`, `unit/processors/` for pure
  ones) are unchanged.
- The `App` interface in `composition-root.ts` has no `repositories` section.
- `packages/types` owns all the record types formerly in `*.repo.ts`.

## Committing

Each sub-plan (0–4) should be its own commit (or a small set). Suggested commit
messages:

```
mailops-v2.0: export Db type + convert launch-sequence service to Prisma-direct
mailops-v2.1: convert inbox-sync/run-schedule/send-email/tracking to Prisma-direct
mailops-v2.2: convert jobs/watch/monitor/controllers/lib to Prisma-direct
mailops-v2.3: delete repository layer; move record types to @coldjot/types
mailops-v2.4: verify — full gate green, repo-collapse complete
```

If you've been committing per-sub-plan as you go, the verify step (sub-plan 4)
may just be the final gate-run + STATUS update, with no new code commit.

## After this plan

`refactor/mailops-v2` now contains the Prisma-direct architecture. **Don't merge
to `master` yet** — live with it for a bit first. Compare:

- `refactor/mailops` — the repository-layer version (your fallback).
- `refactor/mailops-v2` — the Prisma-direct version.

When you're confident v2 is the way forward, merge `refactor/mailops-v2` →
`master` (or rebase first if `master` moved). If you decide you preferred the
repo layer after all, abandon `mailops-v2` — `refactor/mailops` is intact.

## Definition of done (for the whole plan)

- [ ] `apps/mailops/src/repositories/` directory no longer exists.
- [ ] `apps/mailops/src/__tests__/repositories/` directory no longer exists.
- [ ] Repo fakes deleted from `__tests__/helpers/fakes/` (adapter/infra fakes kept).
- [ ] `grep -r "@/repositories" apps/mailops/src/` returns no output.
- [ ] All domain services take `db: Db` (no repo deps).
- [ ] Domain-service tests moved to integration tier; passing against Postgres.
- [ ] Pure-helper unit tests (~46) still pass, unchanged.
- [ ] Record types moved to `@coldjot/types`.
- [ ] `npm run -w mailops typecheck` clean.
- [ ] `npm run -w mailops lint` 0 errors.
- [ ] `npm run -w mailops test` green (fast tier).
- [ ] `npm run -w mailops test:integration` green (needs Postgres).
- [ ] [STATUS.md](./STATUS.md) definition-of-done checkboxes all ticked.
- [ ] Each sub-plan's STATUS row flipped to ✅.
