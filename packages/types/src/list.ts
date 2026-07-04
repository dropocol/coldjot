import { z } from "zod";
import type { Contact } from "./contact";
import type { PaginationMeta } from "./common";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EmailList {
  id: string;
  name: string;
  userId: string;
  description?: string;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
  contacts: Contact[];
}

/** Response shape of GET /api/lists/[id]. */
export interface ListDetailResponse extends EmailList {
  contacts: Contact[];
  _pagination: PaginationMeta;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

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
