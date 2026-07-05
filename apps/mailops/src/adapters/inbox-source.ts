import type { GmailHistoryRecord, MessageDetails } from "@coldjot/types";

/**
 * Adapter interface — abstracts the Gmail PubSub history-sync + message-fetch
 * surface. The dormant ThreadProcessor (deleted in Phase 5) was a polling/
 * IMAP implementation of this same contract; this is the future seam for any
 * inbox source.
 */

export interface FetchHistoryInput {
  startHistoryId: string;
  accessToken: string;
}

export interface FetchHistoryResult {
  history: GmailHistoryRecord[];
  nextPageToken?: string;
  historyId: string;
}

export interface FetchMessageInput {
  messageId: string;
  accessToken: string;
  mailbox: { id: string; email: string };
}

export interface MailboxTokenRef {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
}

export interface InboxSource {
  /** Fetch incremental history since `startHistoryId`. Null when gap is unrecoverable. */
  fetchHistory(input: FetchHistoryInput): Promise<FetchHistoryResult | null>;
  /** Fetch a single message's details. Null when not found / unreadable. */
  fetchMessage(input: FetchMessageInput): Promise<MessageDetails | null>;
  /** Refresh token if needed; returns a valid access token or null on failure. */
  getValidAccessToken(mailbox: MailboxTokenRef): Promise<string | null>;
}
