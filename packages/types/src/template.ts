import { z } from "zod";

export interface Template {
  id: string;
  userId: string;
  name: string;
  subject: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export type TemplateWithSections = Template;

// ─── Bulk delete ─────────────────────────────────────────────────────────────

/**
 * Bulk hard-delete a set of templates. Templates have no soft-delete column
 * (no `deletedAt`), so this is PURGE-only: the rows are removed for real.
 *
 * `templateIds` is capped to keep the request bounded.
 *
 * FK note: a Template referenced by a Draft has a `Restrict` FK, so deleting
 * it will throw at the DB level. The route handles this by returning 500 (the
 * caller must remove the draft first). SequenceStep.templateId and
 * EmailRecord.templateId are `SetNull` and auto-null out.
 */
export const bulkDeleteTemplatesSchema = z.object({
  templateIds: z.array(z.string().min(1)).min(1).max(1000),
});
export type BulkDeleteTemplatesInput = z.infer<typeof bulkDeleteTemplatesSchema>;

// ─── Repository record shapes (mailops v2: lived in template.repo.ts, now here) ─

/** Narrow projection of a Template row read for email send / subject lookup. */
export interface TemplateRecord {
  id: string;
  subject: string | null;
  content: string | null;
}
