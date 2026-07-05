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

export interface EmailThreadRepository {
  /** Look up a thread, optionally with the parent sequence. */
  findByThread(threadId: string, withSequence?: boolean): Promise<EmailThreadRecord | null>;
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
  /** Update thread metadata (thread-watch check cadence). */
  updateMetadata(threadId: string, metadata: Record<string, unknown>): Promise<void>;
  /** Mark a thread COMPLETED (no mailbox found, etc.). */
  markCompleted(threadId: string, reason: string, at: Date): Promise<void>;
}
