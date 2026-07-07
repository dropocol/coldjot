import { z } from "zod";

// ─── Types ───────────────────────────────────────────────────────────────────

/** API-shape DTO for a contact. Distinct from the Prisma `Contact` model. */
export interface Contact {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null; // null = active; Date = soft-deleted (tombstone)
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const createContactSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.email().trim().max(254),
  phone: z.string().trim().max(50).optional(),
});
export type CreateContactInput = z.infer<typeof createContactSchema>;

export const updateContactSchema = createContactSchema.partial();
export type UpdateContactInput = z.infer<typeof updateContactSchema>;

export const batchCreateContactsSchema = z.object({
  contacts: z.array(createContactSchema).min(1).max(1000),
});
export type BatchCreateContactsInput = z.infer<typeof batchCreateContactsSchema>;

// ─── Bulk delete / restore / purge ────────────────────────────────────────────

/** How a bulk-delete should behave. */
export const bulkDeleteModeSchema = z.enum(["soft", "hard"]);
export type BulkDeleteMode = z.infer<typeof bulkDeleteModeSchema>;

/**
 * Bulk-delete (soft or hard) a set of contacts.
 * - mode: "soft" (default) → set deletedAt = now() on each. Reversible via restore.
 * - mode: "hard"           → PURGE: delete the contact AND all its children
 *   (analytics, events, tracking, threads, sequence enrollments, drafts, list
 *   memberships). Irreversible. Used for the "Delete permanently" UI option.
 *
 * `contactIds` is capped to keep the request bounded; the route processes them
 * in a transaction (sub-plan 03).
 */
export const bulkDeleteContactsSchema = z.object({
  contactIds: z.array(z.string().min(1)).min(1).max(1000),
  mode: bulkDeleteModeSchema.default("soft"),
});
export type BulkDeleteContactsInput = z.infer<typeof bulkDeleteContactsSchema>;

/** Restore previously soft-deleted contacts (flip deletedAt back to null). */
export const restoreContactsSchema = z.object({
  contactIds: z.array(z.string().min(1)).min(1).max(1000),
});
export type RestoreContactsInput = z.infer<typeof restoreContactsSchema>;

/**
 * Hard-purge a set of contacts. Identical shape to bulk-delete with mode:"hard",
 * kept as a distinct schema so a dedicated purge endpoint/route can validate it
 * independently and so the intent is explicit at the call site.
 */
export const purgeContactsSchema = z.object({
  contactIds: z.array(z.string().min(1)).min(1).max(1000),
});
export type PurgeContactsInput = z.infer<typeof purgeContactsSchema>;

// ─── Repository record shapes (mailops v2: lived in contact.repo.ts, now here) ──

/**
 * Narrow projection of a Contact row as read for outgoing email. Distinct from
 * the API-shape `Contact` above; this is the persistence record owned here so
 * the database extension and mailops share one definition.
 */
export interface ContactRecord {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
