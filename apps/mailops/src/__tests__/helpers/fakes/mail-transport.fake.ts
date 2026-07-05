/**
 * In-memory fakes for the adapter interfaces: `MailTransport` + `InboxSource`.
 * Backs the `SendEmailServiceImpl` + `InboxSyncServiceImpl` unit tests.
 */
import type { gmail_v1 } from "googleapis";
import type { GmailHistoryRecord, MessageDetails } from "@coldjot/types";
import type {
  MailTransport,
  SendMessageInput,
  SendMessageResult,
  InsertMessageInput,
  SentMessageDetails,
} from "@/adapters/mail-transport";
import type {
  InboxSource,
  FetchHistoryInput,
  FetchHistoryResult,
  FetchMessageInput,
  MailboxTokenRef,
} from "@/adapters/inbox-source";

import { FakeBase, genId } from "./base";

// ---- MailTransport --------------------------------------------------------

export interface RecordedSend {
  userId: string;
  mailboxId: string;
  raw: string;
  threadId?: string;
}

export class FakeMailTransport extends FakeBase implements MailTransport {
  sends: RecordedSend[] = [];
  inserts: Array<InsertMessageInput & { mailboxId: string }> = [];
  deletes: Array<{ id: string; userId: string; mailboxId: string }> = [];
  /** Id returned by send(); overridden by tests. */
  nextSendId = genId("msg");
  nextThreadId = genId("thread");
  /** Details returned by getSentDetails(). */
  sentDetails: SentMessageDetails = {
    messageId: "<sent@example>",
    subject: "Test subject",
    threadId: this.nextThreadId,
    headers: [],
  };
  /** The raw gmail handle returned by getClient(). */
  gmailHandle: any = {};
  /** Throw this from send() to simulate a transport error (e.g. 401). */
  sendError: Error | null = null;

  async getClient(userId: string, mailboxId: string): Promise<gmail_v1.Gmail> {
    this.record("getClient", [userId, mailboxId]);
    return this.gmailHandle as gmail_v1.Gmail;
  }

  async send(
    input: SendMessageInput & { mailboxId: string }
  ): Promise<SendMessageResult> {
    this.record("send", [input]);
    this.sends.push(input);
    if (this.sendError) throw this.sendError;
    return { id: this.nextSendId, threadId: this.nextThreadId };
  }

  async insert(
    input: InsertMessageInput & { mailboxId: string }
  ): Promise<{ id: string }> {
    this.record("insert", [input]);
    this.inserts.push(input);
    return { id: genId("untracked") };
  }

  async delete(id: string, userId: string, mailboxId: string): Promise<void> {
    this.record("delete", [id, userId, mailboxId]);
    this.deletes.push({ id, userId, mailboxId });
  }

  async getSentDetails(
    id: string,
    userId: string,
    mailboxId: string
  ): Promise<SentMessageDetails> {
    this.record("getSentDetails", [id, userId, mailboxId]);
    return { ...this.sentDetails };
  }

  override reset(): void {
    super.reset();
    this.sends = [];
    this.inserts = [];
    this.deletes = [];
    this.sendError = null;
  }
}

// ---- InboxSource ----------------------------------------------------------

export class FakeInboxSource extends FakeBase implements InboxSource {
  /** Canned history response; tests override per-scenario. */
  historyResult: FetchHistoryResult | null = null;
  /** Throw on fetchHistory (e.g. large-gap / null fallback). */
  historyError: Error | null = null;
  /** Per-messageId canned details. */
  messages: Record<string, MessageDetails> = {};
  /** Token returned by getValidAccessToken (null = refresh failed). */
  accessToken = "fake-access-token";

  async fetchHistory(input: FetchHistoryInput): Promise<FetchHistoryResult | null> {
    this.record("fetchHistory", [input]);
    if (this.historyError) throw this.historyError;
    return this.historyResult;
  }

  async fetchMessage(input: FetchMessageInput): Promise<MessageDetails | null> {
    this.record("fetchMessage", [input]);
    return this.messages[input.messageId] ?? null;
  }

  async getValidAccessToken(mailbox: MailboxTokenRef): Promise<string | null> {
    this.record("getValidAccessToken", [mailbox]);
    return this.accessToken;
  }

  override reset(): void {
    super.reset();
    this.historyResult = null;
    this.historyError = null;
    this.messages = {};
    this.accessToken = "fake-access-token";
  }
}

export type { GmailHistoryRecord };
