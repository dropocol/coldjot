import type { gmail_v1 } from "googleapis";
import { EmailLabelEnum } from "@coldjot/types";

/**
 * Adapter interface — abstracts the Gmail API send/insert/delete/get surface
 * (and the OAuth client construction) behind a single transport contract.
 *
 * Phase 4b deletes the SMTP branch; this interface is the seam any future
 * provider (SMTP, Outlook, send-through-API) plugs into.
 */

export interface SendMessageInput {
  /** Gmail user id — `"me"` for the authenticated user. */
  userId: string;
  /** base64url-encoded RFC822 message. */
  raw: string;
  /** Optional thread id to append into. */
  threadId?: string;
}

export interface SendMessageResult {
  id: string;
  threadId?: string;
}

export interface InsertMessageInput {
  userId: string;
  raw: string;
  threadId?: string;
  /** Folder labels e.g. `[EmailLabelEnum.SENT]`. */
  labelIds: string[];
}

export interface MessageDetails {
  messageId: string | undefined;
  subject: string | undefined;
  threadId: string | undefined;
  headers: gmail_v1.Schema$MessagePartHeader[];
}

export interface MailTransport {
  /** Send a message; returns Gmail's assigned id + threadId. */
  send(input: SendMessageInput): Promise<SendMessageResult>;
  /** Insert a message into a folder (used for the untracked sent copy). */
  insert(input: InsertMessageInput): Promise<{ id: string }>;
  /** Delete a message (used to remove the tracked original from sent). */
  delete(id: string): Promise<void>;
  /** Fetch a sent message's headers — used to recover the real Message-ID. */
  getSentDetails(id: string): Promise<MessageDetails>;
  /** Get a gmail client bound to a user+mailbox (for thread-info fetches). */
  getClient(userId: string, mailboxId: string): Promise<gmail_v1.Gmail>;
}

/** Default label set when inserting the untracked sent copy. */
export const SENT_LABEL = EmailLabelEnum.SENT;
