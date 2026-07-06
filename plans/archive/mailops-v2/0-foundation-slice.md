# 0 — Foundation + launch-sequence slice ✅

> **Goal:** export the `Db` type, create the `domainExtension`, and convert one
> service (`launch-sequence`) + its tests end-to-end as the pattern proof.
>
> **Status:** ✅ **Done** — uncommitted on `refactor/mailops-v2`. 149 fast + 132
> integration tests green; typecheck clean.

## What shipped

### Foundation

- **`packages/database/src/index.ts`** — exported `type Db = ReturnType<typeof
  createPrismaClient>`; composed the new `domainExtension` with the existing
  token-encryption extension.
- **`packages/database/src/domain-extension.ts`** — **new file.** Defines 8
  methods:
  - `sequence.findByIdForUser`, `sequence.findForLaunch`, `sequence.findWithDetails`,
    `sequence.findWithBusinessHours`, `sequence.setStatus`, `sequence.resetToDraft`
  - `businessHours.findBySequence`, `businessHours.createForSequence`
- **`packages/database/package.json`** — added `@coldjot/types` dependency (the
  extension references its types).

### Record types moved to `@coldjot/types`

- **`packages/types/src/sequence.ts`** — added `SequenceRecord`,
  `SequenceWithLaunchGraph`, `SequenceWithDetails` (were in
  `apps/mailops/src/repositories/sequence.repo.ts`).

### Service converted

- **`apps/mailops/src/services/domain/launch-sequence.service.ts`** — constructor
  takes `db: Db` (was 2 repo deps). All 6 query sites now call extension methods:
  - `this.db.sequence.findForLaunch(...)`, `this.db.sequence.findByIdForUser(...)`
  - `this.db.sequence.setStatus(...)`, `this.db.sequence.resetToDraft(...)`
  - `this.db.businessHours.findBySequence(...)`, `this.db.businessHours.createForSequence(...)`

### Composition root

- **`apps/mailops/src/composition-root.ts`** — `launchSequence` wired with
  `prisma` instead of repo instances. The 18 repo instances are still constructed
  for the unconverted services (removed in sub-plan 3).

### Tests

- **`apps/mailops/src/__tests__/integration/sequence-lifecycle.test.ts`** — passes
  `prisma` directly to the service (was 2 repo instances). Added 2 new cases
  (`pause` + `reset` throw `SequenceNotFoundError` on missing sequence) that the
  unit test had but the integration test didn't.
- **`apps/mailops/src/__tests__/unit/services/launch-sequence.service.test.ts`** —
  **deleted.** The integration test covered everything it tested; keeping both
  was redundant.

## The pattern this establishes (for sub-plans 1–4)

When converting a repo method:

1. **Add the method to `domain-extension.ts`** under the relevant `model.X`
   block. Copy the body verbatim from the `prisma/prisma-X.repo.ts` file.
   Replace `prisma.X.findUnique(...)` with `(Prisma.getExtensionContext(this)).findUnique(...)`.
2. **Move record types to `@coldjot/types`** if the method returns a type that
   lived in the old repo file.
3. **Rebuild:** `npm run build -w @coldjot/types && npm run build -w @coldjot/database`.
4. **Swap the call site:** `this.xRepo.method(...)` → `this.db.x.method(...)`.
5. **Drop the repo dep** from the constructor; add `db: Db`.
6. **Verify:** `npm run typecheck -w mailops` + relevant tests.

## Verification (recorded)

```
typecheck:    clean
fast tier:    149 passing (was 159 — dropped 10 from the deleted unit test)
integration:  132 passing (was 130 — gained 2 new error-path cases)
```

## Definition of done — ✅

- [x] `export type Db` available from `@coldjot/database`.
- [x] `domainExtension` created + composed with encryption extension.
- [x] `SequenceRecord` / `SequenceWithLaunchGraph` / `SequenceWithDetails` moved to `@coldjot/types`.
- [x] `launch-sequence.service.ts` takes `db: Db`, uses extension methods.
- [x] Composition root wires `launchSequence` with `prisma`.
- [x] Integration test covers all cases (unit test deleted as redundant).
- [x] `npm run typecheck -w mailops` clean.
- [x] `npm run test -w mailops` green.
- [x] `npm run test:integration -w mailops -- sequence-lifecycle` green.
- [x] [STATUS.md](./STATUS.md) foundation tracker → ✅.

## What's next

[Sub-plan 1](./1-domain-services.md) — convert the other 4 domain services
(`inbox-sync`, `run-schedule`, `send-email`, `tracking`) using the same pattern.
