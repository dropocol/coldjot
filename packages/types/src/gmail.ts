import type { gmail_v1 } from "googleapis";

export type MessagePartHeader = gmail_v1.Schema$MessagePartHeader;
export type Gmail = gmail_v1.Gmail;
export type Message = gmail_v1.Schema$Message;

import type { Mailbox } from "./mailbox";

// ─── Client config ───────────────────────────────────────────────────────────

export interface GmailClientOptions {
  userId?: string;
  accessToken: string;
  tokenType?: string;
}

export interface GmailClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface MailboxCredentials {
  mailboxId: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  tokenType?: string;
  expiryDate?: number;
}

// ─── Send / update options ───────────────────────────────────────────────────

export interface SendGmailOptions {
  to: string;
  subject: string;
  content: string;
  threadId?: string;
  originalContent?: string;
  accessToken?: string;
  mailbox?: Mailbox;
}

export interface UpdateSentEmailOptions {
  to: string;
  subject: string;
  accessToken: string;
  messageId: string;
  originalContent: string;
  threadId?: string;
  mailbox?: Mailbox;
}

export interface GmailResponse {
  messageId: string;
  threadId?: string;
}

// ─── Drafts ──────────────────────────────────────────────────────────────────

export interface CreateDraftOptions {
  to: string;
  subject: string;
  content: string;
  accessToken: string;
}

export interface SendDraftOptions {
  draftId: string;
  accessToken: string;
}

// ─── Headers / messages ──────────────────────────────────────────────────────

export interface ThreadHeaders {
  messageId: string;
  inReplyTo?: string;
  references?: string[];
}

export interface EmailResult {
  messageId?: string;
  threadId?: string;
  success?: boolean;
  error?: string;
  isFake?: boolean;
}

export interface MessageHeader {
  name?: string;
  value?: string;
}

export interface GmailMessage {
  payload?: {
    headers?: MessageHeader[];
  };
}
