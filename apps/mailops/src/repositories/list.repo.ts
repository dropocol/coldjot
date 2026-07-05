/**
 * Repository interface for the EmailList model.
 *
 * Call sites: services/jobs/list/helper (syncListToSequences — list +
 * sequences + paginated contacts).
 */

export interface ListSequenceRef {
  id: string;
}

export interface ListWithSequences {
  id: string;
  sequences: ListSequenceRef[];
}

export interface ListContactRow {
  id: string;
  email: string;
}

export interface ListRepository {
  /** Contact count for a list (used by the list-sync processor to sort). */
  contactCount(listId: string): Promise<number>;
  /** Load a list with the sequences attached to it (sync routing). */
  findWithSequences(listId: string): Promise<ListWithSequences | null>;
  /** Fetch a page of contacts on a list (sync batches contacts in chunks). */
  findContactsPage(
    listId: string,
    take: number,
    skip: number
  ): Promise<ListContactRow[]>;
}
