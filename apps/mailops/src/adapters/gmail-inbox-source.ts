import type { MessageDetails } from "@coldjot/types";
import { logger } from "@/lib/log";
import { refreshTokenIfNeeded } from "@/lib/google/gmail/helper";
import { GMAIL_API } from "@/config/gmail/constants";
import { isReplyMessage } from "@/utils/email";
import type {
  InboxSource,
  FetchHistoryInput,
  FetchHistoryResult,
  FetchMessageInput,
  MailboxTokenRef,
} from "./inbox-source";

/**
 * Gmail API implementation of `InboxSource`.
 *
 * Extracted from services/pubsub/handler.ts in Phase 4c.1 (move-only). These
 * three methods were the only `fetch()` callers in the handler — they hold the
 * Gmail REST surface (history list + message metadata) and the OAuth token
 * refresh. Relocating them lets the domain orchestrator depend on the
 * `InboxSource` interface instead of touching `fetch` / `refreshTokenIfNeeded`
 * directly.
 *
 * The bodies are byte-for-byte the original handler.ts logic; the only change
 * is the shape of the inputs (now the interface types from inbox-source.ts).
 */
export class GmailInboxSource implements InboxSource {
  async getValidAccessToken(mailbox: MailboxTokenRef): Promise<string | null> {
    return refreshTokenIfNeeded({
      mailboxId: mailbox.id,
      userId: mailbox.userId,
      accessToken: mailbox.accessToken,
      refreshToken: mailbox.refreshToken,
      expiryDate: mailbox.expiryDate,
    });
  }

  async fetchHistory(input: FetchHistoryInput): Promise<FetchHistoryResult | null> {
    try {
      // Remove label filtering to get ALL changes
      const url = `${GMAIL_API.HISTORY}?startHistoryId=${input.startHistoryId}&historyTypes=messageAdded&historyTypes=labelAdded&historyTypes=labelRemoved`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch history: ${response.statusText}`);
      }

      const data = await response.json();
      return data as FetchHistoryResult;
    } catch (error) {
      logger.error({ error }, "Failed to fetch Gmail history");
      throw error;
    }
  }

  async fetchMessage(input: FetchMessageInput): Promise<MessageDetails | null> {
    const { messageId, accessToken, mailbox } = input;
    try {
      // Log the attempt to fetch message details with mailbox info
      logger.debug(
        {
          messageId,
          mailboxId: mailbox.id,
          mailboxEmail: mailbox.email,
        },
        "Attempting to fetch message details"
      );

      const response = await fetch(
        `${GMAIL_API.MESSAGES}/${messageId}?format=metadata&metadataHeaders=from&metadataHeaders=subject&metadataHeaders=delivered-to&metadataHeaders=content-type&metadataHeaders=x-failed-recipients&metadataHeaders=in-reply-to&metadataHeaders=references`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      // Handle different response statuses
      if (response.status === 404) {
        // For draft messages or recently deleted messages, log and return null
        logger.info(
          {
            messageId,
            mailboxId: mailbox.id,
            mailboxEmail: mailbox.email,
          },
          "Message not found (possibly a draft or deleted message)"
        );
        return null;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to fetch message: ${response.statusText}. Details: ${errorText}`
        );
      }

      const data = (await response.json()) as any;
      const headers = data.payload?.headers || [];

      // Skip draft messages early
      if (data.labelIds?.includes("DRAFT")) {
        logger.debug(
          {
            messageId,
            mailboxId: mailbox.id,
            mailboxEmail: mailbox.email,
          },
          "Skipping draft message"
        );
        return null;
      }

      // Extract message details
      const from =
        headers.find(
          (h: { name: string; value: string }) =>
            h.name.toLowerCase() === "from"
        )?.value || "";

      const subject =
        headers.find(
          (h: { name: string; value: string }) =>
            h.name.toLowerCase() === "subject"
        )?.value || "";

      // Check if message has required data
      if (!data.id || !data.threadId) {
        logger.warn(
          {
            messageId,
            mailboxId: mailbox.id,
            mailboxEmail: mailbox.email,
          },
          "Message data missing required fields"
        );
        return null;
      }

      const messageDetails: MessageDetails = {
        id: data.id,
        messageId: messageId,
        threadId: data.threadId,
        from,
        subject,
        labelIds: data.labelIds || [],
        isReply: isReplyMessage(headers),
        headers,
      };

      logger.debug(
        {
          messageId,
          details: messageDetails,
          mailboxId: mailbox.id,
          mailboxEmail: mailbox.email,
        },
        "Successfully fetched message details"
      );

      return messageDetails;
    } catch (error) {
      // Log error with context but don't throw
      logger.error(
        {
          messageId,
          mailboxId: mailbox.id,
          mailboxEmail: mailbox.email,
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Failed to fetch message details"
      );
      return null;
    }
  }
}
