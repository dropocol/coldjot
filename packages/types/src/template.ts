import { z } from "zod";

import { bulkDeleteModeSchema } from "./contact";

export interface Template {
  id: string;
  userId: string;
  name: string;
  subject: string;
  content: string;
  deletedAt: Date | null; // soft-delete tombstone; null = active
  createdAt: Date;
  updatedAt: Date;
}

export type TemplateWithSections = Template;

// ─── Bulk delete ─────────────────────────────────────────────────────────────

/**
 * Bulk delete templates. Soft-delete by default (sets deletedAt); hard-purge
 * only when `mode: "hard"` AND no template is in active use.
 *
 * Active-use guard: a template referenced by a step in an ACTIVE or PAUSED
 * sequence is NEVER deletable (409), regardless of mode. Soft-deleted templates
 * still resolve at send time (see plans/template-delete-guards/README.md) —
 * trash state hides them from the editor, it does not blank future sends.
 *
 * `mode: "hard"` purges rows for real. It still respects the active-use guard
 * (you cannot hard-purge an in-use template). Hard-purge is the GDPR/burn path.
 */
export const bulkDeleteTemplatesSchema = z.object({
  templateIds: z.array(z.string().min(1)).min(1).max(1000),
  mode: bulkDeleteModeSchema.default("soft"),
});
export type BulkDeleteTemplatesInput = z.infer<typeof bulkDeleteTemplatesSchema>;

/** A template that blocks a delete because it's in active use. */
export interface BlockedTemplate {
  id: string;
  name: string;
  sequences: { id: string; name: string; status: string }[];
}

/** Response shape for POST /api/templates/bulk-delete. */
export interface BulkDeleteTemplatesResult {
  deleted: number; // count actually soft-deleted or hard-purged
  mode: "soft" | "hard";
  blocked: number; // count that couldn't be deleted (in active use)
  blockedTemplates: BlockedTemplate[];
}

/** 409 response body when a delete is blocked by active use. */
export interface TemplateInUseError {
  error: string;
  blocked: true;
  blockedTemplates: BlockedTemplate[];
}

// ─── Repository record shapes (mailops v2: lived in template.repo.ts, now here) ─

/** Narrow projection of a Template row read for email send / subject lookup. */
export interface TemplateRecord {
  id: string;
  subject: string | null;
  content: string | null;
  deletedAt: Date | null; // present for completeness; send path MUST ignore it (see README)
}
