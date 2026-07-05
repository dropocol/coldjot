/**
 * Repository interface for the EmailThread model.
 * Call sites: lib/email-subject, services/pubsub, services/jobs/email,
 * services/jobs/thread-watch.
 */

export interface EmailThreadRecord {
  threadId: string;
  sequenceId: string;
  contactId: string;
  userId: string;
  firstMessageId: string | null;
  subject: string | null;
  isFake: boolean;
  lastCheckedAt: Date | null;
  metadata: Record<string, unknown> | null;
}

/** Thread row with the parent sequence's userId joined (thread-watch). */
export interface EmailThreadWithSequence extends EmailThreadRecord {
  sequence: { userId: string };
}

export interface EmailThreadRepository {
  /** Look up a thread, optionally with the parent sequence. */
  findByThread(
    threadId: string,
    withSequence?: boolean
  ): Promise<EmailThreadRecord | null>;
  /** Fetch just the subject (email-subject resolution). */
  findSubjectByThread(threadId: string): Promise<string | null>;
  /** Fetch sequenceId + contactId for a thread (pubsub routing). */
  findSequenceContactByThread(
    threadId: string
  ): Promise<{ sequenceId: string; contactId: string } | null>;
  /** Create a thread row on first send. */
  create(input: {
    threadId: string;
    sequenceId: string;
    contactId: string;
    userId: string;
    firstMessageId: string;
    subject: string;
    isFake?: boolean;
  }): Promise<EmailThreadRecord>;
  /**
   * Find threads that need checking (thread-watch processor). The where clause
   * is built by the caller (age + lastCheckedAt tiers); passed through as-is.
   * Ordered by updatedAt desc, lastCheckedAt asc, createdAt asc.
   */
  findManyForChecking(
    where: Record<string, unknown>,
    take: number
  ): Promise<EmailThreadWithSequence[]>;
  /**
   * Update lastCheckedAt + metadata after a thread-watch check pass.
   * Both fields are written together (the metadata reflects the check).
   */
  updateCheckMetadata(
    threadId: string,
    lastCheckedAt: Date,
    metadata: Record<string, unknown>
  ): Promise<void>;
  /**
   * Mark a thread COMPLETED with merged metadata (thread-watch when no
   * mailbox is found, etc.). Existing metadata is spread into the new blob.
   */
  markCompleted(
    threadId: string,
    existingMetadata: Record<string, unknown> | null,
    reason: string,
    at: Date
  ): Promise<void>;
}
