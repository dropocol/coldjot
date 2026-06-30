# Plan 06 — Database Schema Hardening: Indexes, Cascade Policy, Migration Hygiene

> **Severity:** 🟡 MEDIUM (but the missing indexes and cascade behavior will bite under load / during incidents)
> **Effort:** Large (2–3 days, mostly testing)
> **Depends on:** Plan 02b (token encryption) if you want to land them in the same migration sweep. Otherwise independent.

---

## Problem

The Prisma schema (`packages/database/prisma/schema.prisma`, 21 models) has several structural issues:

### 1. Missing indexes on FK columns (perf under load)

Every query that filters/joins on these columns does a sequential scan:

| Model | Field | Line | Why it matters |
|---|---|---|---|
| `Session` | `userId` | 60 | Every authenticated request joins `Session`→`User` via `userId`; middleware hits this on every page load |
| `Template` | `userId` | 93 | Templates are always listed per-user |
| `Draft` | `contactId` | 109 | Listing a contact's drafts |
| `Draft` | `templateId` | 110 | Listing drafts by template |
| `EmailEvent` | `contactId` | 320 | Analytics queries filter by contact |
| `EmailEvent` | `sequenceId` | 321 | Analytics queries filter by sequence |

`Account` correctly has `@@index([userId])` (L54) — use it as the template.

### 2. Cascade delete policy is dangerous (data-loss risk)

Deleting a `User` cascades through almost the entire dataset (L51, 62, 76, 100, 118, 129, 157, 385, 400, 436): `Account`, `Session`, `Contact`, `Template`, `Draft`, `EmailList`, `Sequence`, `EmailThread`, `BusinessHours`, `Mailbox`, `SequenceMailbox`. A single `user.delete()` permanently erases a tenant's entire history with **no recovery path** (see #3).

Specific risky cascades:
- `Draft` → `Contact` (L119, `onDelete: Cascade`) — deleting a contact silently destroys all that contact's drafts.
- `Mailbox` → `EmailAlias` (L451) — dropping a mailbox nukes aliases.
- `Sequence` → `SequenceStep`, `SequenceStats`, `SequenceHealth`, `SequenceMailbox` (L191, 246, 255, 466).
- `BusinessHours.sequenceId` (L399, Cascade) — re-linking a sequence to a new mailbox can wipe business-hours config.

### 3. No soft deletes

No `deletedAt` / `isDeleted` on any model. All deletions are hard. Combined with cascades, this is a footgun.

### 4. Inconsistent cascade policy

Most relations are `Cascade`, but several are implicitly `Restrict` (Prisma default when no rule is specified):
- `Draft.templateId` (L120) — no rule → Restrict
- `SequenceContact.sequence` / `contact` (L211–212) — no rule → Restrict
- `EmailThread.sequence` / `contact` (L386–387) — no rule → Restrict
- `EmailTracking.contact` / `sequence` (L297–298) — no rule → Restrict

This means deleting a sequence that has contacts enrolled **fails** (Restrict) while deleting one without contacts cascades — surprising and inconsistent.

### 5. Multi-tenancy enforced only in app code

Ownership is a `userId` FK on most models, but the schema can't enforce it. Notable gaps:
- `EmailTracking.userId` (L281) has **no FK relation declared** — orphanable.
- `EmailEvent` (L313) has **no `userId` field at all** — tenant association is only reachable via `trackingId`→`EmailTracking.userId`. Cross-tenant queries are easy to write by accident.
- `SequenceMailbox.userId` (L462) is a denormalized convenience column with no unique constraint; can drift from `sequence.userId`.
- `ProcessedMessage`, `TrackedLink`, `LinkClick`, `EmailWatchHistory`, `ListSyncRecord` have **no tenant column at all** — world-readable if a query omits the parent filter.
- No Prisma client extension (`$extends`) or middleware injects mandatory `userId` filters.

### 6. Schema anomalies suggesting hand-edits

- `EmailTracking` declares `Template Template? @relation(fields: [templateId], references: [id])` (L301) **and** `templateId String?` (L302) — the scalar appears after the relation. There's also a commented-out duplicate relation block (L299–300). This smells like a manual edit; verify a migration exists for it.
- Naming inconsistency: relations use PascalCase (`EmailList`, `Sequence`, `Mailbox`) in `User` (L29–34) while the model names are also PascalCase — fine, but `Contact.contacts` (L74) is a self-referential-sounding name for `SequenceContact[]` which is confusing.

### 7. Migration sprawl

**97 migrations** for 21 models. Evidence of churn:
- 4 migrations on `20241223` renaming `thread_id` ↔ `gmail_thread_id` back and forth.
- ~15 migrations named `update_event_tracking` across Nov 2024.
- Many generically named `updated_schema` / `updated_account_schema` same-day pairs.

This isn't broken, but it indicates the schema was edited reactively. Run `prisma migrate status` to confirm zero drift.

### 8. No connection-pool tuning

`packages/database/src/index.ts` instantiates `PrismaClient` with no connection URL params. Prisma defaults to `num_cpus * 2 + 1` connections. Under serverless/Next.js this risks pool exhaustion.

### 9. Plaintext tokens (covered in plan 02)

`Mailbox.access_token/refresh_token/id_token` (L425–431) and `Account` equivalents (L43–48) — see plan 02b. Mentioned here only because the encryption migration belongs in the same sweep as the index migrations.

---

## Goal

1. Every FK that's filtered or joined has an index.
2. Cascade policy is **explicit and consistent** — no implicit `Restrict` surprises.
3. User deletion is **soft** by default; hard delete is a deliberate, audited operation.
4. Tenant isolation is structurally harder to violate (FK on `EmailTracking.userId`, tenant column on analytics-adjacent tables, or a documented reason not to).
5. Migrations are clean and drift-free; a CONTRIBUTING note prevents future sprawl.
6. Prisma connection limits are tuned for the deployment.

---

## Implementation steps

### Step 1 — Add missing indexes

In `schema.prisma`:

```prisma
model Session {
  // ...
  @@index([userId])      // ADD
}

model Template {
  // ...
  @@index([userId])      // ADD
}

model Draft {
  // ...
  @@index([userId])      // ADD (also useful)
  @@index([contactId])   // ADD
  @@index([templateId])  // ADD
}

model EmailEvent {
  // ...
  @@index([trackingId])  // exists
  @@index([type])        // exists
  @@index([timestamp])   // exists
  @@index([contactId])   // ADD
  @@index([sequenceId])  // ADD
}
```

Then:
```bash
cd packages/database
npx prisma migrate dev --name add_missing_indexes
```

> Adding indexes is safe and online in Postgres (it takes a brief `SHARE` lock). For large tables, use `CREATE INDEX CONCURRENTLY` — Prisma doesn't emit this directly, so generate the migration, then hand-edit the SQL to use `CONCURRENTLY` and remove the surrounding transaction.

### Step 2 — Make cascade policy explicit

For every relation, decide: Cascade, Restrict, or SetNull. Document the decision inline. Recommended policy:

- **User-owned top-level resources** (`Contact`, `EmailList`, `Sequence`, `Template`, `Mailbox`, `Draft`, `BusinessHours`): `Cascade` on `userId` (deleting a user nukes their data — but see Step 3 for soft-delete).
- **Children of those resources** (`SequenceStep`, `SequenceStats`, `SequenceHealth`, `SequenceMailbox`, `EmailAlias`, `TrackedLink`, `LinkClick`, `EmailWatchHistory`, `ListSyncRecord`): `Cascade` on the parent FK.
- **Cross-references** (`SequenceContact`, `EmailThread`, `EmailTracking`, `EmailEvent`): `Restrict` by default so you can't delete a sequence/contact that has live enrollments/threads without acknowledging it. Provide an explicit "archive" flow first.

Make the implicit ones explicit so they don't surprise:
```prisma
model SequenceContact {
  sequence Sequence @relation("SequenceToContact", fields: [sequenceId], references: [id], onDelete: Restrict)
  contact  Contact  @relation("ContactToSequence", fields: [contactId], references: [id], onDelete: Restrict)
}
```

> ⚠️ Changing cascade rules is a schema migration that Postgres enforces — but it does **not** migrate existing data. Test against a production DB copy.

### Step 3 — Introduce soft deletes (decide scope first)

Adding `deletedAt DateTime?` to every model is invasive. **Recommended scope: only the resources that are dangerous to lose** — `User`, `Sequence`, `Contact`, `Mailbox`, `Template`, `EmailList`. Operational/log tables (`EmailEvent`, `LinkClick`, `ProcessedMessage`) can stay hard-delete.

Minimal approach:

```prisma
model Sequence {
  // ...
  deletedAt DateTime?
  @@index([deletedAt])
}
```

Then:
- Replace `prisma.sequence.delete(...)` with `prisma.sequence.update({ where, data: { deletedAt: new Date() } })`.
- Add a **global Prisma extension** or a convention that every list query appends `where: { deletedAt: null }`. (A Prisma `$extends` query interceptor can do this automatically — but be careful, it's easy to forget for `update`/`delete`.)
- Provide a **true** hard-delete (admin tooling / data-privacy request flow) that respects GDPR "right to erasure".

> A full soft-delete framework is a big project. If the team isn't ready, at minimum add `deletedAt` to `User` so account deletion is reversible for a grace period.

### Step 4 — Tighten tenant isolation structurally

a) **`EmailTracking.userId`** (L281) — add the missing FK:
```prisma
model EmailTracking {
  // ...
  userId String
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

b) **`EmailEvent`** — add a denormalized `userId` so analytics queries don't have to join through `trackingId`:
```prisma
model EmailEvent {
  // ...
  userId String?
  // (nullable during backfill; make required after)
}
```
Then write a backfill that populates it from the tracking row.

c) **Optional: a Prisma client extension** that injects `userId` into every query on tenant-scoped models. This is powerful but can mask bugs; prefer the application-layer `requireAuth` + scoped queries from plan 01 and treat the extension as defense-in-depth.

### Step 5 — Clean up schema anomalies

- Remove the commented-out duplicate `Template` relation in `EmailTracking` (L299–300).
- Move `templateId String?` (L302) above its relation declaration for consistency.
- Consider renaming `Contact.contacts: SequenceContact[]` (L74) to `sequenceContacts` to avoid the self-referential confusion.

### Step 6 — Migration hygiene

a) **Confirm zero drift:**
```bash
cd packages/database
npx prisma migrate status
```
If drift is reported, reconcile with `prisma migrate diff` / `prisma migrate resolve`.

b) **Adopt a migration naming convention:** every `migrate dev --name` should be descriptive and imperative (`add_user_soft_delete`, not `updated_schema`). Add a note to `packages/database/README.md` or the root `.cursorrules`.

c) **Optional (advanced): squash migrations.** 97 migrations slow down fresh DB creation and CI. Prisma supports a baseline+squash workflow via `prisma migrate diff --from-empty --to-schema-datamodel > baseline.prisma` and a shadow DB. Only do this if every environment is on the latest migration; coordinate carefully.

### Step 7 — Tune Prisma connection limits

Append pooling params to `DATABASE_URL` (or set in the env that constructs it):

```
DATABASE_URL="postgresql://...?connection_limit=10&pool_timeout=20"
```

- For **Vercel/serverless** web: use `connection_limit=5` per function instance, or better, **PgBouncer** (transaction mode) with `?pgbouncer=true&connection_limit=1`.
- For the **mailops** long-running process: `connection_limit=10–20` is fine.

Document the chosen values in `docs/database.md`.

### Step 8 — Add a Prisma client extension for tenant safety (optional, defense-in-depth)

If you want belt-and-suspenders, a `$extends` query extension can reject queries on tenant-scoped models that don't include a `userId` filter. This is noisy to maintain but catches the class of bug in plan 01 at the data layer. Only do this if the team is committed to the pattern.

---

## Files to touch

**Modify:**
- `packages/database/prisma/schema.prisma` (indexes, cascade policy, soft-delete fields, FK additions, anomaly cleanup)
- `packages/database/src/index.ts` (connection limits — partly via env)
- `apps/web/src/app/api/**/route.ts` and `apps/mailops/src/services/**` — replace `.delete()` with `.update({ data: { deletedAt } })` for soft-deleted models; add `deletedAt: null` to list queries
- `docs/database.md` (document cascade policy + pooling)

**Create:**
- New Prisma migration(s): `add_missing_indexes`, `add_user_soft_delete`, `add_emailtracking_user_fk`, etc.
- Optional: `packages/database/scripts/backfill-emial-event-userid.ts`

---

## Verification

### Indexes
- `EXPLAIN ANALYZE` a representative query before and after — confirm it switches from `Seq Scan` to `Index Scan`. Example:
  ```sql
  EXPLAIN ANALYZE SELECT * FROM "Session" WHERE "userId" = '<id>';
  ```

### Cascades
- Test the delete paths in a staging DB: deleting a `User` should behave per the new policy; deleting a `Sequence` with enrolled contacts should now `Restrict` (error) rather than silently cascade.

### Soft delete
- `DELETE /api/contacts/<id>` should set `deletedAt`, not remove the row. The contact should disappear from `GET /api/contacts` (filtered) but remain in the DB.
- A GDPR erasure script should still be able to truly delete.

### Migration health
- `npx prisma migrate status` reports no drift.
- A fresh `prisma migrate reset` on a clean DB succeeds and produces a schema matching `schema.prisma` (`prisma migrate diff --from-schema-datasource ... --to-schema-datamodel ...` reports no diff).

### Connection pool
- Under load-test traffic, monitor Postgres `pg_stat_activity` — connection count stays within the configured limit; no `Timed out fetching connection` errors.

---

## Risks & rollback

- **Cascade rule changes can break existing delete flows.** Test every delete endpoint against a staging DB copy. Roll back the migration if a route relies on the old behavior.
- **Soft-delete queries that forget `deletedAt: null`** will surface "deleted" rows — a common bug. Mitigate with a centralized list-query helper or the Prisma extension.
- **Adding `userId` FK to `EmailTracking`** requires every existing row to have a `userId` (it's `String`, not `String?`). Backfill first if any rows are null.
- **Squashing migrations is hard to reverse** — only do it once the team is aligned and all envs are in sync.
- **Connection-limit tuning** that's too low will cause request queuing under load; too high will exhaust Postgres `max_connections`. Load-test before committing.
- All schema changes are migration-gated; rollback by reverting the migration (which itself requires a new migration). Keep a DB backup before any destructive migration.
