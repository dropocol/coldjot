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
}
