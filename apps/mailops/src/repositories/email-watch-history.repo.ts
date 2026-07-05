/**
 * Repository interface for the EmailWatchHistory model.
 * Call sites: services/pubsub/helper, services/pubsub/handler, services/watch/cleanup.
 */

export interface EmailWatchHistoryRecord {
  id: string;
  emailWatchId: string;
  historyId: string;
  notificationType: string;
  processed: boolean;
  data: Record<string, unknown>;
}

export interface EmailWatchHistoryRepository {
  /** Idempotency check: has this historyId already been processed? */
  findProcessed(
    emailWatchId: string,
    historyId: string
  ): Promise<EmailWatchHistoryRecord | null>;
  /** Upsert a history record (create-or-update). */
  upsert(input: {
    id: string;
    emailWatchId: string;
    historyId: string;
    notificationType: string;
    processed: boolean;
    data: Record<string, unknown>;
  }): Promise<void>;
  /** Create a new history record (initial notification intake). */
  create(input: {
    id: string;
    emailWatchId: string;
    historyId: string;
    notificationType: string;
    processed: boolean;
    data: Record<string, unknown>;
  }): Promise<void>;
  /** Mark a notification as processed. */
  markProcessed(id: string): Promise<void>;
  /** Purge history older than the cutoff that's already processed. */
  purgeProcessedBefore(cutoff: Date): Promise<{ count: number }>;
}
