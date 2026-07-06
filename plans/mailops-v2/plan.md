# Mailops v2 — Full Plan (Prisma Extension Approach)

## 1. Why

`apps/mailops` has a hand-written repository layer — 18 interfaces in
`src/repositories/*.repo.ts` and 18 Prisma implementations in
`src/repositories/prisma/prisma-*.ts`. That's 36 files for 18 concepts, ~72
import sites, ~10 test fakes, and 18 repo test files. Every service declares
4–8 repo dependencies; the composition root instantiates all 18 and wires
them in.

The user's verdict: **this abstraction isn't wanted.** Prisma is already the
data-access abstraction. The parallel interface layer is a second abstraction
doing the same job, and the cost (files to remember, import sites to keep
straight, constructor ceremony) outweighs the benefit (a swappable seam that
will never be exercised, since Prisma is the locked choice).

**This plan deletes the repository layer and replaces it with a Prisma
`$extends({ model })` extension** — named, reusable data-access methods
attached directly to Prisma models (`db.sequence.resetToDraft(id)`), defined
once in `packages/database`.

The 24 domain-service unit tests that relied on repo fakes move to the
integration tier (real Postgres — already running). The 46 pure-helper unit
tests are unaffected.

## 2. The Prisma extension approach

Prisma supports adding custom methods to models via the `model` component of
`$extends`. A method defined as:

```ts
// packages/database/src/domain-extension.ts
import { Prisma } from "@prisma/client";

export const domainExtension = Prisma.defineExtension({
  name: "domain",
  model: {
    sequence: {
      async resetToDraft(this: unknown, id: string): Promise<void> {
        const ctx = Prisma.getExtensionContext(this);
        await ctx.update({
          where: { id },
          data: { status: "draft", testMode: false, disableSending: false },
        });
      },
    },
  },
});
```

…becomes available on the client as `db.sequence.resetToDraft(id)`. The
extension is composed onto the Prisma client alongside the existing
token-encryption extension in `packages/database/src/index.ts`:

```ts
return base
  .$extends(tokenEncryptionExtension)
  .$extends(domainExtension);
```

Consumers receive the extended client via injection (`db: Db`) and call the
methods directly. IDE autocomplete works on `db.sequence.` — every method is
discoverable.

### The `this` / `getExtensionContext` pattern

Inside a `model` extension method, `this` is an opaque extension context, not
the Prisma delegate. To call Prisma operations (`findUnique`, `update`,
`create`, etc.), get the typed delegate via:

```ts
const ctx = Prisma.getExtensionContext(this);
await ctx.findUnique({ where: { id } });
```

Always type the method's first parameter as `this: unknown` so the method
signature stays clean. This is pitfall #1 in STATUS.md.

### Transactions

`$transaction` callbacks receive a narrower client (`Prisma.TransactionClient`)
that does **not** carry extension methods. For code that needs to run
extension methods inside a transaction, define the method to accept an
optional delegate, or inline raw Prisma in the transaction body. Two files
use `$transaction` today (`lib/stats/index.ts`, `tracking.service.ts`) — both
are pure raw-Prisma in the callback, so no extension method is needed inside.

## 3. The end state

```text
packages/database/src/
├── index.ts              ← composes tokenEncryption + domainExtension; exports Db + prisma
├── domain-extension.ts   ← all domain methods, one block per model
└── crypto.ts             ← (existing) encryption helpers

apps/mailops/src/
├── composition-root.ts   ← builds services with db: prisma; no repo wiring
├── services/domain/      ← each service takes db: Db, calls this.db.X.method()
├── services/jobs/        ← same
├── controllers/          ← mailbox/list take db; others delegate to services
└──  (NO repositories/ folder)
└──  (NO __tests__/repositories/ folder)
└──  (NO __tests__/helpers/fakes/ repo fakes — adapter/infra fakes kept)
```

### What each consumer looks like after

**Domain service** — one `db` dep, calls named methods:
```ts
constructor(
  private readonly db: Db,
  private readonly jobManager: JobManager,
  private readonly monitoring: MonitoringService,
  private readonly rateLimitService: Pick<RateLimitService, "resetLimits">,
) {}

async launch(sequenceId: string, userId: string) {
  const sequence = await this.db.sequence.findForLaunch(sequenceId, userId, ["completed", "opted_out"]);
  // ... validation, then:
  await this.db.sequence.setStatus(sequenceId, "active");
  // ...
}
```

**Composition root** — one line per service:
```ts
const launchSequence = new LaunchSequenceServiceImpl(prisma, jobManager, monitoring, rateLimit);
```

## 4. The mechanics (apply to every repo method)

For each method on each repo:

1. **Add the method to `domain-extension.ts`** under the relevant `model.X`
   block. Copy the method body verbatim from the Prisma impl file
   (`prisma/prisma-X.repo.ts`). Replace `prisma.X` references with
   `Prisma.getExtensionContext(this)` (the typed delegate for the current
   model).

2. **Move record types to `@coldjot/types`.** If the method's return type
   references a record type (`ContactRecord`, `DueContactGraph`, etc.) that
   lived in the old `*.repo.ts` file, move that type to
   `@coldjot/types/src/<domain>.ts` and re-export.

3. **Rebuild the packages:**
   ```bash
   npm run build -w @coldjot/types && npm run build -w @coldjot/database
   ```

4. **Swap the call site.** In every consumer, replace `this.xRepo.method(...)`
   with `this.db.x.method(...)`. Replace the repo dependency in the
   constructor with `db: Db`.

5. **Don't delete the repo files yet.** They stay until sub-plan 3 — other
   unconverted consumers may still import them.

6. **Verify:** `npm run typecheck -w mailops` + relevant tests.

### Subtleties to watch

- **`Prisma.getExtensionContext(this)` is mandatory.** Calling `this.findUnique()`
  directly inside a model extension method does not work — `this` is the
  extension context, not the delegate. Always extract the delegate first.
- **Method-first param `this: unknown`.** Without it, TypeScript infers a
  complex `this` type that bleeds into the call site signature.
- **Record types must move before the repo file is deleted.** Sub-plan 3
  deletes the repo files; until then, the old `*.repo.ts` files can still
  export the types (they're just not the source of truth anymore once the
  extension method exists).
- **Processors that hard-assign repos in their constructor body**
  (`services/jobs/email/processor.ts`) become `this.db = db` (injected).
- **The encryption extension needs `ENCRYPTION_KEY`** for Mailbox writes;
  integration test setup (`__tests__/setup.ts`) already provides it.

## 5. Sub-plans

### Sub-plan 0 — Foundation + vertical slice (`launch-sequence`) ✅

**Done.** Exported `Db`; created `domainExtension` with 8 methods (6 on
`sequence`, 2 on `businessHours`); composed it with the encryption extension;
moved `SequenceRecord` / `SequenceWithLaunchGraph` / `SequenceWithDetails` to
`@coldjot/types`; converted `launch-sequence.service.ts`; merged its unit test
into the existing integration test. Green: 149 fast + 132 integration tests.

See [0-foundation-slice.md](./0-foundation-slice.md).

---

### Sub-plan 1 — Remaining domain services

**Services:** `inbox-sync`, `run-schedule`, `send-email`, `tracking`.

For each service: add its repo methods to the extension (under the relevant
`model.X` block), move record types to `@coldjot/types`, swap the call sites
from `this.xRepo.method()` to `this.db.x.method()`, drop the repo deps from
the constructor, move the unit test to integration.

See [1-domain-services.md](./1-domain-services.md).

---

### Sub-plan 2 — Jobs, watch, monitor, controllers, lib helpers

**Consumers:** processors (sequence/email/contact/schedule/list + their
helpers), watch (`index.ts`, `cleanup.ts`), monitor, mailbox/list
controllers, lib helpers that take repos as params today.

Each consumer gets `db: Db`; its repo queries become extension methods.

See [2-jobs-watch-monitor-controllers-lib.md](./2-jobs-watch-monitor-controllers-lib.md).

---

### Sub-plan 3 — Delete the repository layer

With all consumers off repos, delete:
- `src/repositories/` (all 36 files).
- `src/__tests__/repositories/` (18 repo test files).
- Repo fakes from `src/__tests__/helpers/fakes/` (keep adapter/infra fakes).
- Composition root: remove all `new PrismaXRepository()` lines + repo fields.

Confirm no `@/repositories` imports remain anywhere.

See [3-delete-repository-layer.md](./3-delete-repository-layer.md).

---

### Sub-plan 4 — Verify + commit

Full gate: `typecheck`, `lint`, `test`, `test:integration`. Confirm:
- `grep -r "@/repositories" apps/mailops/src/` → no output.
- File count drops from ~126 to ~90 non-test files.

See [4-verify-commit.md](./4-verify-commit.md).

## 6. Record-type home

**Decision (applied in sub-plan 0):** domain record types move to
`@coldjot/types`. They represent domain concepts, and `@coldjot/types` is
already the home for `BusinessHours`, `Sequence`, `ProcessingJob`,
`EmailEvent`, etc. Other packages (e.g. `apps/web`) may want them too.

Sub-plan 0 moved `SequenceRecord`, `SequenceWithLaunchGraph`,
`SequenceWithDetails`. Sub-plans 1–2 move the rest as each service is
converted.

## 7. Scope — explicitly out

- **No service-locator / god-object `app`.** (Discussed and rejected.)
- **No facade grouping** (`this.sequences.businessHours…`). Extensions already
  give you the discoverable namespace (`db.sequence.X`).
- **No changes to `apps/web`.** Nothing outside `apps/mailops` imports mailops
  repos.
- **No changes to the Prisma schema or migrations.** Code-organization
  refactor only.
- **No renaming of the `prisma` singleton.** Consumers receive it as `db`
  via injection; the singleton keeps its name.

## 8. Quick reference — consumers to convert

| Layer | Files | Methods to add to extension |
|---|---|---|
| Domain services | `launch-sequence` ✅, `inbox-sync`, `run-schedule`, `send-email`, `tracking` | sequence ✅, businessHours ✅, mailbox, emailWatch, emailWatchHistory, processedMessage, emailThread, sequenceContact, emailEvent, emailTracking, trackedLink |
| Processors | `sequence`, `email`, `contact`, `schedule`, `list` (processor.ts + helper.ts) | (per processor's repo usage) |
| Watch | `watch/index.ts`, `watch/cleanup.ts` | mailbox, emailWatch |
| Monitor | `monitor/service.ts` | sequenceStats |
| Controllers | `mailbox.controller.ts`, `list.controller.ts` | mailbox, listSyncRecord |
| Lib helpers | `email-subject.ts`, `mailbox/index.ts`, `stats/index.ts`, `schedule/index.ts` | emailThread, emailTracking, template, mailbox |
| Composition root | `composition-root.ts` | wires all services with `prisma` |

## 9. Reversibility

Every sub-plan is independently committable and leaves the app green. The
repo files stay in place until sub-plan 3, so you can stop at any sub-plan
boundary and the app works. `refactor/mailops` (the base branch) is untouched
— full fallback if you abandon v2.
