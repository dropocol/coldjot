import type { gmail_v1 } from "googleapis";
import { gmailClientService } from "@/lib/google";
import type {
  MailTransport,
  SendMessageInput,
  SendMessageResult,
  InsertMessageInput,
  MessageDetails,
} from "./mail-transport";

/**
 * Gmail API implementation of `MailTransport`.
 *
 * Extracted from lib/email/index.ts in Phase 4b.1. Each method fetches a fresh
 * Gmail client via `gmailClientService.getClient(userId, mailboxId)` — the
 * client service caches OAuth tokens internally so the per-call cost is one
 * cache lookup. The previous code fetched one client and reused it across
 * send/get/insert/delete; this is equivalent in effect.
 *
 * `send`/`insert`/`getSentDetails` carry `(userId, mailboxId)` so the transport
 * can construct the client itself — the orchestrator no longer touches the
 * Gmail client directly.
 */
export class GmailTransport implements MailTransport {
  async getClient(userId: string, mailboxId: string): Promise<gmail_v1.Gmail> {
    return gmailClientService.getClient(userId, mailboxId);
  }

  async send(
    input: SendMessageInput & { mailboxId: string }
  ): Promise<SendMessageResult> {
    const gmail = await this.getClient(input.userId, input.mailboxId);
    const { data } = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: input.raw,
        threadId: input.threadId || undefined,
      },
    });
    return { id: data.id!, threadId: data.threadId ?? undefined };
  }

  async insert(
    input: InsertMessageInput & { mailboxId: string }
  ): Promise<{ id: string }> {
    const gmail = await this.getClient(input.userId, input.mailboxId);
    const { data } = await gmail.users.messages.insert({
      userId: "me",
      requestBody: {
        raw: input.raw,
        threadId: input.threadId,
        labelIds: input.labelIds,
      },
    });
    return { id: data.id! };
  }

  async delete(
    id: string,
    userId: string,
    mailboxId: string
  ): Promise<void> {
    const gmail = await this.getClient(userId, mailboxId);
    await gmail.users.messages.delete({ userId: "me", id });
  }

  async getSentDetails(
    id: string,
    userId: string,
    mailboxId: string
  ): Promise<MessageDetails> {
    const gmail = await this.getClient(userId, mailboxId);
    const sentMessage = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "full",
    });

    const headers = sentMessage.data.payload?.headers || [];
    const messageIdHeader = headers.find(
      (h) => h.name?.toLowerCase() === "message-id"
    )?.value;
    const subjectHeader = headers.find(
      (h) => h.name?.toLowerCase() === "subject"
    )?.value;

    return {
      messageId: messageIdHeader || id,
      subject: subjectHeader || undefined,
      threadId: sentMessage.data.threadId || undefined,
      headers,
    };
  }
}
