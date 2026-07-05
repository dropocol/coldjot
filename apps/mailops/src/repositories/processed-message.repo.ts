/**
 * Repository interface for the ProcessedMessage model.
 * Call sites: services/pubsub/helper.
 */

export interface ProcessedMessageRecord {
  id: string;
  messageId: string;
  threadId: string;
  type: string;
}

export interface ProcessedMessageRepository {
  /** Idempotency check: has this messageId already been processed? */
  findByMessageId(messageId: string): Promise<ProcessedMessageRecord | null>;
  /** Record a processed message (P2002 tolerant in callers). */
  create(input: {
    messageId: string;
    threadId: string;
    type: string;
  }): Promise<ProcessedMessageRecord>;
  /** Is there any prior processed message for a thread? */
  hasOriginalForThread(threadId: string): Promise<boolean>;
}
