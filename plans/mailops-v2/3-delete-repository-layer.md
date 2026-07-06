# 3 — Delete the repository layer

> **Goal:** with every consumer off repos, delete the repository layer +
> repository tests + repo fakes. By this point all record types have already
> moved to `@coldjot/types` (done incrementally in sub-plans 0–2).
>
> **Status:** ⬜ Not started · 🟡 In progress · ✅ Done — _(update STATUS.md when you flip this)_

## Prerequisite

Sub-plans 0–2 complete. Verify before starting:

```bash
cd "/Volumes/Data/00-My Projects/ColdJot/coldjot"
# No production code references repositories/:
grep -r "@/repositories" apps/mailops/src/ --include="*.ts" | grep -v __tests__
# Expected: no output (or only test-fake references, which this sub-plan deletes)
```

If anything in production still imports a repo, **stop** — go back and finish the
relevant sub-plan. Deleting repo files with live importers breaks compilation.

## Tasks

### Task 1 — Confirm all record types have moved

By this point, sub-plans 0–2 should have moved every record type to
`@coldjot/types` as each service was converted. Verify:

```bash
# Every record type should resolve from @coldjot/types, not @/repositories:
grep -r "from \"@/repositories/" apps/mailops/src/ --include="*.ts" | grep "import type"
# Expected: no output
```

If any remain (a type that was imported but not moved), move it now to
`@coldjot/types/src/<domain>.ts` and repoint the import. Then rebuild:
`npm run build -w @coldjot/types && npm run build -w @coldjot/database`.

### Task 2 — Delete the repository directories

```bash
cd "/Volumes/Data/00-My Projects/ColdJot/coldjot/apps/mailops"
rm -rf src/repositories/                                    # 36 files
rm -rf src/__tests__/repositories/                          # 18 repo test files
```

### Task 3 — Delete repo fakes (keep adapter fakes)

```bash
# Repo fakes to delete:
rm src/__tests__/helpers/fakes/sequence.fake.ts             # repo fakes
rm src/__tests__/helpers/fakes/tracked-link.fake.ts
rm src/__tests__/helpers/fakes/link-click.fake.ts
rm src/__tests__/helpers/fakes/email-event.fake.ts
rm src/__tests__/helpers/fakes/inbox-sync-repos.fake.ts
rm src/__tests__/helpers/fakes/email-tracking.fake.ts

# KEEP these (they fake adapters/infra, not repos):
#   mail-transport.fake.ts    — fakes GmailTransport
#   inbox-source.fake.ts      — fakes GmailInboxSource (if it exists)
#   stubs.ts                  — FakeJobManager, FakeRateLimitService (infra)
#   base.ts                   — FakeBase/MemoryStore used by repo fakes — DELETE if unused after
```

Update `src/__tests__/helpers/fakes/index.ts` (barrel) — remove repo-fake
re-exports, keep adapter/infra re-exports. If `base.ts` is only used by deleted
fakes, delete it too.

### Task 4 — Clean the composition root

`src/composition-root.ts`:

- Delete all 18 `new PrismaXRepository()` instantiation lines.
- Delete the `repositories` section of the `App` interface (the 18 repo fields).
- Delete the 18 `XRepository` type imports at the top.
- Every service/controller constructor now takes `db` (= `prisma`) — verify the
  wiring passes `prisma` to each.

The `App` interface shrinks significantly — the `repositories` block (~18 lines)
goes away.

### Task 5 — Verify nothing references the deleted code

```bash
grep -r "@/repositories" apps/mailops/src/                   # expected: no output
grep -r "Prisma.*Repository" apps/mailops/src/ --include="*.ts"  # expected: no output
grep -r "implements.*Repository\b" apps/mailops/src/ --include="*.ts"  # expected: no output (fakes gone)
```

## Files touched

- `apps/mailops/src/repositories/` — **delete (36 files)**
- `apps/mailops/src/__tests__/repositories/` — **delete (18 files)**
- `apps/mailops/src/__tests__/helpers/fakes/` — delete 6 repo fakes; trim barrel; maybe delete `base.ts`
- `apps/mailops/src/composition-root.ts` — remove repo instantiation + interface fields

*(Record types already moved in sub-plans 0–2; nothing to move here.)*

## Definition of done

- [ ] `src/repositories/` directory deleted.
- [ ] `src/__tests__/repositories/` directory deleted.
- [ ] Repo fakes deleted; adapter/infra fakes kept; barrel trimmed.
- [ ] Composition root: no `new PrismaXRepository()`; `App` interface has no repo fields.
- [ ] `grep -r "@/repositories" apps/mailops/src/` returns no output.
- [ ] `npm run typecheck -w mailops` clean.
- [ ] `npm run test -w mailops` green.
- [ ] `npm run test:integration -w mailops` green.
- [ ] [STATUS.md](./STATUS.md) sub-plan 3 row → ✅.
