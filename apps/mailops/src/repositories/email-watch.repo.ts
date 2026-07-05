/**
 * Repository interface for the EmailWatch model.
 * Call sites: services/watch, services/pubsub, services/watch/cleanup.
 */

export interface EmailWatchRecord {
  id: string;
  userId: string;
  email: string;
  historyId: string;
  expiration: Date;
}

export interface EmailWatchRepository {
  /** Find a watch by its id. */
  findById(id: string): Promise<EmailWatchRecord | null>;
  /** Find a watch by its mailbox email. */
  findByEmail(email: string): Promise<EmailWatchRecord | null>;
  /** Find all watches whose expiration is at/before the buffer time. */
  findDueForRenewal(buffer: Date): Promise<EmailWatchRecord[]>;
  /** Dev helper: list every watch. */
  listAll(): Promise<EmailWatchRecord[]>;
  /** Create a new watch row. */
  create(input: {
    id: string;
    userId: string;
    email: string;
    historyId: string;
    expiration: Date;
  }): Promise<EmailWatchRecord>;
  /** Update historyId + expiration by id (renewal). */
  updateById(
    id: string,
    data: { historyId?: string; expiration?: Date }
  ): Promise<void>;
  /** Update historyId + expiration by email (setup-on-existing). */
  updateByEmail(
    email: string,
    data: { historyId?: string; expiration?: Date }
  ): Promise<void>;
  /** Delete a watch by email (stop). */
  deleteByEmail(email: string): Promise<void>;
}
