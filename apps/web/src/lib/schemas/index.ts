import { z } from "zod";

// ─── Contacts ───────────────────────────────────────────────────────────────

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

// ─── Lists ──────────────────────────────────────────────────────────────────

export const updateListSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    contacts: z.array(z.string().min(1)).optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict();
export type UpdateListInput = z.infer<typeof updateListSchema>;

export const addContactToListSchema = z.object({
  contactId: z.string().min(1),
});
export type AddContactToListInput = z.infer<typeof addContactToListSchema>;

export const setListContactsSchema = z.object({
  contactIds: z.array(z.string().min(1)).min(1),
});
export type SetListContactsInput = z.infer<typeof setListContactsSchema>;

// ─── Sequences ──────────────────────────────────────────────────────────────

export const launchSequenceSchema = z.object({
  // Fixes a bug where {"testMode":"yes"} passed a truthy string.
  testMode: z.boolean().default(false),
});
export type LaunchSequenceInput = z.infer<typeof launchSequenceSchema>;

export const addContactToSequenceSchema = z.object({
  contactId: z.string().min(1),
});
export type AddContactToSequenceInput = z.infer<
  typeof addContactToSequenceSchema
>;

// Allowlist + strict: rejects unknown keys to close the mass-assignment gap.
export const updateSequenceStepSchema = z
  .object({
    subject: z.string().max(200).nullable().optional(),
    content: z.string().nullable().optional(),
    body: z.string().nullable().optional(),
    delayAmount: z.number().int().min(0).max(365).nullable().optional(),
    delayUnit: z.string().max(20).nullable().optional(),
    timing: z.string().max(50).nullable().optional(),
    priority: z.string().max(50).nullable().optional(),
    stepType: z.string().max(50).nullable().optional(),
    includeSignature: z.boolean().nullable().optional(),
    note: z.string().nullable().optional(),
    replyToThread: z.boolean().nullable().optional(),
    previousStepId: z.string().nullable().optional(),
    templateId: z.string().nullable().optional(),
    order: z.number().int().min(0).nullable().optional(),
    waitDays: z.number().int().min(0).max(365).nullable().optional(),
    waitHours: z.number().int().min(0).max(23).nullable().optional(),
  })
  .strict();
export type UpdateSequenceStepInput = z.infer<typeof updateSequenceStepSchema>;

// ─── Common ─────────────────────────────────────────────────────────────────

export const idParamSchema = z.object({
  id: z.string().min(1),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().optional(),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

// ─── Drafts ─────────────────────────────────────────────────────────────────

export const sendDraftSchema = z.object({
  draftId: z.string().min(1),
});
export type SendDraftInput = z.infer<typeof sendDraftSchema>;

// ─── Tracking ───────────────────────────────────────────────────────────────

export const trackEventSchema = z.object({
  emailId: z.string().min(1),
});
export type TrackEventInput = z.infer<typeof trackEventSchema>;
