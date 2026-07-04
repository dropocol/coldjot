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
