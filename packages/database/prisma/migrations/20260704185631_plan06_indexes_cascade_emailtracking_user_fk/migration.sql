-- Plan 06: Missing indexes, explicit cascade policy, EmailTracking.userId FK.
--
-- This migration is additive + behavior-preserving:
--   1. Adds missing B-tree indexes on FK columns that are filtered/joined often.
--   2. Adds the missing EmailTracking.userId → User FK (onDelete: Cascade),
--      consistent with the other User-owned top-level relations.
--   3. Re-declares previously implicit (Prisma-default) FK rules explicitly so
--      the schema matches the DB's actual current behavior. No existing rule is
--      changed — every "ALTER ... DROP CONSTRAINT + ADD CONSTRAINT" below
--      re-establishes the SAME onDelete policy that already exists in the DB
--      (verified by walking the migration history). This just makes the policy
--      explicit in the Prisma schema so future edits don't get surprised.
--
-- ⚠️ PRE-MIGRATION OPERATOR STEPS (run on a DB BACKUP first, never blind):
--   a) Back up the database: `pg_dump -Fc ... > pre-plan06.dump`.
--   b) Verify EmailTracking.userId has no orphans before the FK is added:
--        SELECT COUNT(*) FROM "EmailTracking" et
--        LEFT JOIN "User" u ON u.id = et."userId"
--        WHERE u.id IS NULL;
--      If the count is > 0, those rows reference a deleted User and must be
--      cleaned up first — otherwise `ADD CONSTRAINT ... FOREIGN KEY ("userId")`
--      will fail. Decide intentionally: re-point them to a real user, or delete
--      them. Then re-run the check until it returns 0.
--   c) Apply this migration against a STAGING copy first and run the
--      verification queries from plans/refactor-plan/06-database-schema.md.
--   d) Only after staging verifies, apply to production with `prisma migrate deploy`.

-- ============================================================
-- 1. Missing indexes (Step 1)
-- ============================================================

-- Session.userId — hit on every authenticated request (Session→User join).
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- Template.userId — templates are always listed per-user.
CREATE INDEX "Template_userId_idx" ON "Template"("userId");

-- Draft.{userId, contactId, templateId} — listing a contact's drafts /
-- drafts by template / a user's drafts.
CREATE INDEX "Draft_userId_idx" ON "Draft"("userId");
CREATE INDEX "Draft_contactId_idx" ON "Draft"("contactId");
CREATE INDEX "Draft_templateId_idx" ON "Draft"("templateId");

-- EmailEvent.{contactId, sequenceId} — analytics queries filter by contact/sequence.
CREATE INDEX "EmailEvent_contactId_idx" ON "EmailEvent"("contactId");
CREATE INDEX "EmailEvent_sequenceId_idx" ON "EmailEvent"("sequenceId");

-- ============================================================
-- 2. EmailTracking.userId → User FK (Step 4a)
-- ============================================================
-- The column already exists (non-null String). This just adds the FK
-- constraint that was missing, so the row can no longer be orphaned and
-- deleting a User cascades their tracking rows (consistent with Contact,
-- Sequence, Template, Mailbox, etc., which all cascade on userId).

ALTER TABLE "EmailTracking" ADD CONSTRAINT "EmailTracking_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 3. Make implicit cascade rules explicit (Step 2)
-- ============================================================
-- Each block below drops the existing constraint and re-adds it with the
-- SAME onDelete policy it already had in the DB (verified via migration
-- history). The only goal is to make the policy explicit in schema.prisma so
-- future edits don't rely on Prisma's implicit default. No behavior change.

-- Draft.templateId: RESTRICT (was implicit default; verified unchanged).
ALTER TABLE "Draft" DROP CONSTRAINT "Draft_templateId_fkey";
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "Template"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- SequenceContact.sequenceId / contactId: RESTRICT (was implicit default).
ALTER TABLE "SequenceContact" DROP CONSTRAINT "SequenceContact_sequenceId_fkey";
ALTER TABLE "SequenceContact" ADD CONSTRAINT "SequenceContact_sequenceId_fkey"
  FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SequenceContact" DROP CONSTRAINT "SequenceContact_contactId_fkey";
ALTER TABLE "SequenceContact" ADD CONSTRAINT "SequenceContact_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- SequenceStep.templateId: SET NULL (verified final state from migration history).
ALTER TABLE "SequenceStep" DROP CONSTRAINT "SequenceStep_templateId_fkey";
ALTER TABLE "SequenceStep" ADD CONSTRAINT "SequenceStep_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "Template"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- EmailTracking.contactId / sequenceId / templateId: SET NULL (verified final state).
ALTER TABLE "EmailTracking" DROP CONSTRAINT "EmailTracking_contactId_fkey";
ALTER TABLE "EmailTracking" ADD CONSTRAINT "EmailTracking_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmailTracking" DROP CONSTRAINT "EmailTracking_sequenceId_fkey";
ALTER TABLE "EmailTracking" ADD CONSTRAINT "EmailTracking_sequenceId_fkey"
  FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmailTracking" DROP CONSTRAINT "EmailTracking_templateId_fkey";
ALTER TABLE "EmailTracking" ADD CONSTRAINT "EmailTracking_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "Template"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- EmailEvent.contactId / sequenceId: SET NULL (verified final state).
ALTER TABLE "EmailEvent" DROP CONSTRAINT "EmailEvent_contactId_fkey";
ALTER TABLE "EmailEvent" ADD CONSTRAINT "EmailEvent_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmailEvent" DROP CONSTRAINT "EmailEvent_sequenceId_fkey";
ALTER TABLE "EmailEvent" ADD CONSTRAINT "EmailEvent_sequenceId_fkey"
  FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- EmailThread.sequenceId / contactId: RESTRICT (was implicit default; verified).
ALTER TABLE "EmailThread" DROP CONSTRAINT "EmailThread_sequenceId_fkey";
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_sequenceId_fkey"
  FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EmailThread" DROP CONSTRAINT "EmailThread_contactId_fkey";
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- SequenceMailbox.aliasId: SET NULL (verified final state).
ALTER TABLE "SequenceMailbox" DROP CONSTRAINT "SequenceMailbox_aliasId_fkey";
ALTER TABLE "SequenceMailbox" ADD CONSTRAINT "SequenceMailbox_aliasId_fkey"
  FOREIGN KEY ("aliasId") REFERENCES "EmailAlias"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
