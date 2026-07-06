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

// ─── Repository record shapes (mailops v2: lived in list.repo.ts, now here) ────

/** Just the id of a sequence attached to a list (sync routing). */
export interface ListSequenceRef {
  id: string;
}

/** A list with the sequence ids attached to it (syncListToSequences). */
export interface ListWithSequences {
  id: string;
  sequences: ListSequenceRef[];
}

/** A row of contacts on a list (paginated batch sync). */
export interface ListContactRow {
  id: string;
  email: string;
}

// ─── ListSyncRecord record shapes (mailops v2: lived in list-sync-record.repo.ts) ─

/** A list→sequence sync job record. */
export interface ListSyncRecord {
  id: string;
  listId: string;
  sequenceId: string;
  status: string;
  contactsAdded: number;
  error: string | null;
  createdAt: Date;
}

export interface ListSyncRecordWithCount extends ListSyncRecord {
  list: { _count: { contacts: number } };
}
