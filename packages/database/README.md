# @coldjot/database

Database package for the coldjot application. This package handles all database operations, migrations, and seeding.

## Documentation

For detailed information about available commands and best practices, please see:

- [Database Commands Documentation](../../docs/database.md)

## Quick Start

1. Set up environment files in `env/` directory:

   ```
   env/
   ├── .env.development
   ├── .env.staging
   └── .env.production
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Generate Prisma Client:

   ```bash
   turbo run db:generate --filter=@coldjot/database
   ```

4. Run migrations:

   ```bash
   # Development
   turbo run db:migrate --filter=@coldjot/database

   # Staging
   turbo run db:deploy:staging --filter=@coldjot/database

   # Production
   turbo run db:deploy:prod --filter=@coldjot/database
   ```

## Environment Variables

Required environment variables in your .env files:

```env
# Required for all environments
DATABASE_URL="postgresql://user:password@localhost:5432/database_name"

# Required only for development
SHADOW_DATABASE_URL="postgresql://user:password@localhost:5432/shadow_database_name"
```

See the [Database Commands Documentation](../../docs/database.md) for more details.

## Migration naming convention (plan 06)

Every `prisma migrate dev --name <name>` MUST be descriptive and imperative —
the migration folder name is the only audit trail for what a migration does.
**Never** commit migrations named `updated_schema`, `updated_tracking_schema`,
`stats_updated`, etc. Good names:

- `add_user_soft_delete`
- `add_missing_indexes`
- `add_emailtracking_user_fk`

Same-day "rename it back" pairs (the schema has ~7 of these in late 2024) are a
smell — write the schema you actually want and let one migration take you
there. If you need to fix a migration you just created locally (before commit),
`prisma migrate resolve --rolled-back` it, delete the folder, and recreate.

## Cascade policy (plan 06)

Every foreign key in the schema declares `onDelete` explicitly. The policy:

| Category | Rule | Reason |
| --- | --- | --- |
| **User-owned top-level** (`Contact`, `Template`, `Mailbox`, `Sequence`, `Draft`, `EmailList`, `BusinessHours`, `EmailTracking`, `SequenceMailbox` on `userId`) | `Cascade` | Deleting a user erases their tenant's data. (Soft-delete is the eventual mitigation — see "Deferred" below.) |
| **Parent → children** (`Sequence`→`SequenceStep`/`SequenceStats`/`SequenceHealth`/`SequenceMailbox`/`ListSyncRecord`; `Mailbox`→`EmailAlias`; `EmailTracking`→`TrackedLink`→`LinkClick`; `EmailWatch`→`EmailWatchHistory`) | `Cascade` | Children have no meaning without their parent. |
| **Optional cross-references** (`EmailTracking.contactId/sequenceId/templateId`; `EmailEvent.contactId/sequenceId`; `SequenceStep.templateId`; `SequenceStats.contactId`; `SequenceMailbox.aliasId`) | `SetNull` | The referenced row may be deleted; the referencing row survives with the FK nulled (columns are nullable). |
| **Required cross-references** (`Draft.templateId`; `SequenceContact.sequenceId/contactId`; `EmailThread.sequenceId/contactId`) | `Restrict` | Deleting the referenced row must fail loudly — these rows lose meaning without their parent and the FK is non-nullable. |

> Changing a policy is a destructive migration. Always diff the existing
> constraint against `prisma/migrations/**.sql` first (the rule the DB enforces
> today may not match what `schema.prisma` claims if a prior migration left an
> implicit default). The plan-06 migration `20260704185631_*` exists precisely
> to make all implicit rules explicit *without* changing any behavior.

## Plan 06 migration runbook

Migration `20260704185631_plan06_indexes_cascade_emailtracking_user_fk` is
**additive and behavior-preserving** (verified by diffing it against what
`prisma migrate diff --from-empty --to-schema` emits). It does three things:

1. Adds 7 missing B-tree indexes (`Session.userId`, `Template.userId`,
   `Draft.{userId,contactId,templateId}`, `EmailEvent.{contactId,sequenceId}`).
2. Adds the missing `EmailTracking.userId → User` FK (`onDelete: Cascade`).
3. Re-declares every previously-implicit FK rule explicitly (no behavior change
   — each DROP+ADD re-establishes the same policy that already exists in the DB).

**Before applying, on a DB BACKUP:**

```bash
# 1. Back up.
pg_dump -Fc "$DATABASE_URL" > pre-plan06.dump

# 2. Verify EmailTracking.userId has no orphaned rows (else the FK add fails):
psql "$DATABASE_URL" -c '
  SELECT COUNT(*) FROM "EmailTracking" et
  LEFT JOIN "User" u ON u.id = et."userId"
  WHERE u.id IS NULL;'
# If COUNT > 0 → either re-point those rows to a real user or delete them,
# then re-run until it returns 0.

# 3. Apply on STAGING first:
DATABASE_URL=<staging> prisma migrate deploy

# 4. Verify (see plans/refactor-plan/06-database-schema.md §Verification),
#    then apply to production:
DATABASE_URL=<prod>      prisma migrate deploy
```

## Deferred from plan 06 (intentionally NOT done)

The plan listed several larger items. They are **deliberately deferred** because
they are destructive / invasive and the owner chose to land plan 06's safe
subset first:

- **Soft deletes (`deletedAt`)** on `User`, `Sequence`, `Contact`, `Mailbox`,
  `Template`, `EmailList`. Requires a global Prisma `$extends` query interceptor
  to inject `deletedAt: null` and a hard-delete admin/GDPR flow — a separate
  project.
- **`EmailEvent.userId` denormalized column** + backfill from `EmailTracking`.
- **Tenant-isolation Prisma extension** (defense-in-depth `$extends`).
- **Connection-pool tuning** (`?connection_limit=…&pool_timeout=…` / PgBouncer).
- **Migration squash** (97 migrations → baseline).

