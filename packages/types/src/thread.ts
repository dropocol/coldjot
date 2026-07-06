export interface ThreadCheckData {
  threadId: string;
  userId: string;
  mailboxId: string;
  sequenceId: string;
  contactId: string;
  messageId: string;
  createdAt: Date;
}

export interface ThreadMetadata {
  lastCheckedAt?: string;
  [key: string]: any;
}

// ─── Repository record shapes (concrete DB columns) ─────────────────────────

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
