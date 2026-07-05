/**
 * Repository interface for the ListSyncRecord model.
 * Call sites: routes/lists, services/jobs/list/processor,
 * services/jobs/list/helper.
 */

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

export interface ListSyncRecordRepository {
  /** Enqueue a new list→sequence sync job. */
  create(input: { listId: string; sequenceId: string }): Promise<ListSyncRecord>;
  /** Poll pending sync records ordered oldest-first, with list contact counts. */
  findPending(batchSize: number): Promise<ListSyncRecordWithCount[]>;
  /** Mark a record processing/completed/failed. */
  updateStatus(
    id: string,
    data: { status: string; contactsAdded?: number; error?: string }
  ): Promise<void>;
  /** Bulk update by listId+sequenceId (reconciliation helper). */
  updateStatusByListSequence(
    listId: string,
    sequenceId: string,
    data: { status: string; contactsAdded?: number; error?: string }
  ): Promise<void>;
}
