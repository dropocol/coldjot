import { nanoid } from "nanoid";
import { backOff } from "exponential-backoff";
import {
  PubSubMessage,
  NotificationType,
  HistoryChange,
  GmailHistoryRecord,
  DecodedNotification,
} from "@coldjot/types";
import { PUBSUB_CONFIG } from "@/config/pubsub/constants";
import { logger } from "@/lib/log";
import { fileLogger } from "@/lib/log/file-logger";

import type { MailboxRepository } from "@/repositories/mailbox.repo";
import type { EmailWatchRepository } from "@/repositories/email-watch.repo";
import type { EmailWatchHistoryRepository } from "@/repositories/email-watch-history.repo";
import type { ProcessedMessageRepository } from "@/repositories/processed-message.repo";
import type { EmailThreadRepository } from "@/repositories/email-thread.repo";
import type { SequenceContactRepository } from "@/repositories/sequence-contact.repo";
import type { EmailEventRepository } from "@/repositories/email-event.repo";

import { PrismaMailboxRepository } from "@/repositories/prisma/prisma-mailbox.repo";
import { PrismaEmailWatchRepository } from "@/repositories/prisma/prisma-email-watch.repo";
import { PrismaEmailWatchHistoryRepository } from "@/repositories/prisma/prisma-email-watch-history.repo";
import { PrismaProcessedMessageRepository } from "@/repositories/prisma/prisma-processed-message.repo";
import { PrismaEmailThreadRepository } from "@/repositories/prisma/prisma-email-thread.repo";
import { PrismaSequenceContactRepository } from "@/repositories/prisma/prisma-sequence-contact.repo";
import { PrismaEmailEventRepository } from "@/repositories/prisma/prisma-email-event.repo";

import { GmailInboxSource } from "@/adapters/gmail-inbox-source";
import type { InboxSource } from "@/adapters/inbox-source";
import type { MailboxWithAliases } from "@/repositories/mailbox.repo";
import type { EmailWatchRecord } from "@/repositories/email-watch.repo";
import {
  calculateHistoryGap,
  isLargeHistoryGap,
  hasMessageContent,
  isExternalSender,
  shouldProcessMessage,
  determineNotificationType,
} from "@/services/inbox-sync/classify";
import { applyClassification } from "@/services/inbox-sync/apply-classification";

/**
 * Domain service interface — handles a Gmail PubSub notification by syncing
 * inbox state (classify + apply). Phase 4c replaces PubSubHandler behind this
 * contract.
 */
export interface InboxSyncService {
  handleNotification(message: PubSubMessage): Promise<void>;
}

// ---------------------------------------------------------------------------
// Pure notification / logging helpers (moved from services/pubsub/helper.ts)
// ---------------------------------------------------------------------------

const SENSITIVE_FIELDS = [
  "access_token",
  "refresh_token",
  "id_token",
  "accessToken",
  "refreshToken",
  "Authorization",
  "private_key",
  "client_secret",
  "api_key",
];

/** Redact sensitive fields from anything passed to the file logger. */
function sanitizeData(data: any): any {
  if (!data) return data;
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return data.map((item) => sanitizeData(item));
  if (typeof data !== "object") return data;
  const sanitized = { ...data };
  for (const key in sanitized) {
    if (SENSITIVE_FIELDS.includes(key)) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof sanitized[key] === "object") {
      sanitized[key] = sanitizeData(sanitized[key]);
    }
  }
  return sanitized;
}

function isValidNotification(data: any): data is DecodedNotification {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof data.emailAddress === "string" &&
    (typeof data.historyId === "number" || typeof data.historyId === "string")
  );
}

function decodeNotification(message: PubSubMessage): DecodedNotification {
  try {
    const decodedData = Buffer.from(message.data, "base64").toString();
    const parsedData = JSON.parse(decodedData);
    if (!isValidNotification(parsedData)) {
      throw new Error("Invalid notification format: missing required fields");
    }
    return parsedData;
  } catch (error) {
    logger.error({ error }, "Failed to decode notification data");
    throw new Error("Invalid notification format");
  }
}

// ---------------------------------------------------------------------------
// Watch + mailbox lookup result
// ---------------------------------------------------------------------------

interface WatchWithMailbox extends EmailWatchRecord {
  mailbox: MailboxWithAliases;
}

// ---------------------------------------------------------------------------
// InboxSyncServiceImpl
// ---------------------------------------------------------------------------

/**
 * Flat orchestrator for Gmail PubSub inbox sync.
 *
 * Extracted from services/pubsub/handler.ts (PubSubHandler, ~1300 lines) in
 * Phase 4c.5. Replaces the god-object with a top-to-bottom pipeline:
 *   decode → find watch+mailbox → (retry) → dedupe historyId → refresh token
 *   → gap check → fetch history → per-message: dedupe + classify + record +
 *   applyClassification → update watch historyId.
 *
 * Behavior is identical to PubSubHandler end-to-end (Group C characterization
 * cases 1–8 pin it). What changed:
 *  - Constructor-injected repos + InboxSource (testable; Phase 6 threads this
 *    through createApp()).
 *  - The dead `updateSequenceStatuses` second pass is dropped — it was a
 *    provable no-op (BOUNCE/REPLY already marked terminal by
 *    applyClassification; ORIGINAL/MESSAGE_ADDED maps to no status), so it
 *    never updated a row.
 *  - Gmail REST + OAuth live behind the InboxSource adapter (4c.1).
 *  - Bounce/reply handling is one applyClassification function (4c.4).
 *
 * NOTE on the gap-fallback: the original treated a null history fetch the same
 * as a large gap (update watch historyId + write a HISTORY_GAP record). That's
 * preserved verbatim — fetchHistory throws on non-OK, caught here → fallback.
 */
export class InboxSyncServiceImpl implements InboxSyncService {
  private readonly maxRetries = PUBSUB_CONFIG.MAX_RETRIES;
  private readonly backoffSeconds = PUBSUB_CONFIG.BACKOFF_SECONDS;

  constructor(
    private readonly mailboxRepo: MailboxRepository = new PrismaMailboxRepository(),
    private readonly emailWatchRepo: EmailWatchRepository = new PrismaEmailWatchRepository(),
    private readonly emailWatchHistoryRepo: EmailWatchHistoryRepository = new PrismaEmailWatchHistoryRepository(),
    private readonly processedMessageRepo: ProcessedMessageRepository = new PrismaProcessedMessageRepository(),
    private readonly emailThreadRepo: EmailThreadRepository = new PrismaEmailThreadRepository(),
    private readonly sequenceContactRepo: SequenceContactRepository = new PrismaSequenceContactRepository(),
    private readonly emailEventRepo: EmailEventRepository = new PrismaEmailEventRepository(),
    private readonly inboxSource: InboxSource = new GmailInboxSource()
  ) {}

  async handleNotification(message: PubSubMessage): Promise<void> {
    try {
      fileLogger.log(
        "info",
        "Received PubSub notification",
        sanitizeData({
          messageId: message.messageId,
          publishTime: message.publishTime,
          attributes: message.attributes,
        })
      );

      const notification = decodeNotification(message);
      const watch = await this.getWatchRecord(notification.emailAddress);

      if (!watch) {
        fileLogger.log(
          "warn",
          "No watch found for email address",
          sanitizeData({ emailAddress: notification.emailAddress })
        );
        return;
      }

      await this.processWithRetry(watch, notification.historyId.toString());

      fileLogger.log(
        "info",
        "Successfully processed notification",
        sanitizeData({ messageId: message.messageId })
      );
    } catch (error) {
      fileLogger.log(
        "error",
        "Failed to process notification",
        sanitizeData({
          message: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          messageId: message.messageId,
        })
      );
      throw error;
    }
  }

  // ---- watch + mailbox lookup -------------------------------------------

  private async getWatchRecord(
    email: string
  ): Promise<WatchWithMailbox | null> {
    const watch = await this.emailWatchRepo.findByEmail(email);
    if (!watch) return null;

    const mailbox = await this.mailboxRepo.findWithEmailAliases(email);
    if (!mailbox) {
      fileLogger.log("warn", "No mailbox found for watch", { email, watchId: watch.id });
      return null;
    }
    return { ...watch, mailbox };
  }

  // ---- retry wrapper -----------------------------------------------------

  private async processWithRetry(
    watch: WatchWithMailbox,
    historyId: string
  ): Promise<void> {
    const backoffOptions = {
      numOfAttempts: this.maxRetries,
      startingDelay: this.backoffSeconds * 1000,
      maxDelay: this.backoffSeconds * 5000,
      jitter: "full" as const,
    };
    await backOff(() => this.processHistory(watch, historyId), backoffOptions);
  }

  // ---- the pipeline ------------------------------------------------------

  private async processHistory(
    watch: WatchWithMailbox,
    historyId: string
  ): Promise<void> {
    try {
      // 1. Has this historyId already been processed?
      if (await this.isHistoryIdProcessed(watch.id, historyId)) {
        return;
      }

      // 2. Refresh OAuth token.
      const accessToken = await this.inboxSource.getValidAccessToken({
        id: watch.mailbox.id,
        userId: watch.mailbox.userId,
        accessToken: watch.mailbox.access_token!,
        refreshToken: watch.mailbox.refresh_token!,
        expiryDate: watch.mailbox.expires_at!,
      });
      if (!accessToken) {
        fileLogger.log(
          "error",
          "Failed to get valid access token",
          sanitizeData({ watchId: watch.id, mailboxId: watch.mailbox.id })
        );
        return;
      }

      // 3. History-gap check.
      const { gap, startHistoryId } = calculateHistoryGap(watch.historyId, historyId);
      if (isLargeHistoryGap(gap)) {
        await this.handleLargeHistoryGap(watch, historyId);
        return;
      }

      // 4. Fetch history. A null/throwing fetch falls back to the large-gap path
      //    (preserves original behavior).
      let response;
      try {
        response = await this.inboxSource.fetchHistory({ startHistoryId, accessToken });
      } catch (err) {
        logger.error({ err }, "Failed to fetch Gmail history");
        await this.handleLargeHistoryGap(watch, historyId);
        return;
      }
      if (!response) {
        await this.handleLargeHistoryGap(watch, historyId);
        return;
      }

      // 5. Process each message in the history.
      if (response.history && response.history.length > 0) {
        await this.processHistoryRecords(response, watch, accessToken);
      }

      // 6. Advance the watch's historyId.
      await this.emailWatchRepo.updateById(watch.id, {
        historyId: response.historyId,
      });
    } catch (error) {
      fileLogger.log(
        "error",
        "Failed to process history changes",
        sanitizeData({
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          watchId: watch.id,
          historyId,
        })
      );
      throw error;
    }
  }

  // ---- per-message loop --------------------------------------------------

  private async processHistoryRecords(
    response: { history: GmailHistoryRecord[]; historyId: string },
    watch: WatchWithMailbox,
    accessToken: string
  ): Promise<void> {
    const userEmails = [
      watch.mailbox.email.toLowerCase(),
      ...watch.mailbox.aliases.map((alias) => alias.alias.toLowerCase()),
    ];
    const processedMessageIds = new Set<string>();

    for (const record of response.history || []) {
      const messages = [
        ...(record.messagesAdded || []).map((m) => m.message),
        ...(record.labelsAdded || []).map((m) => m.message),
      ];

      for (const message of messages) {
        if (processedMessageIds.has(message.id)) continue;
        processedMessageIds.add(message.id);

        if (await this.isMessageProcessed(message.id, message.threadId)) continue;
        if (message.labelIds.includes("DRAFT")) continue;

        const details = await this.inboxSource.fetchMessage({
          messageId: message.id,
          accessToken,
          mailbox: { id: watch.mailbox.id, email: watch.mailbox.email },
        });
        if (!details || !hasMessageContent(details.headers)) continue;

        const messageType = await determineNotificationType(
          details,
          userEmails,
          message.threadId,
          (tid) => this.processedMessageRepo.hasOriginalForThread(tid)
        );

        const change: HistoryChange = {
          id: record.id,
          threadId: message.threadId,
          type: messageType,
          messageId: message.id,
          from: details.from,
        };

        await this.createProcessedMessageRecord(message.id, message.threadId, messageType);
        await this.createOrUpdateWatchHistory(watch.id, response.historyId, messageType, {
          emailAddress: watch.mailbox.email,
          historyId: response.historyId,
          type: messageType,
          messageId: message.id,
          threadId: message.threadId,
        });

        if (messageType === NotificationType.BOUNCE || messageType === NotificationType.REPLY) {
          await applyClassification({
            change,
            deps: {
              emailEvent: this.emailEventRepo,
              sequenceContact: this.sequenceContactRepo,
              emailThread: this.emailThreadRepo,
            },
          });
        }

        logger.info(
          {
            messageId: message.id,
            from: details.from,
            finalType: messageType,
            isExternal: isExternalSender(details.from, userEmails),
            shouldProcess: shouldProcessMessage(message.labelIds),
          },
          "Message classification complete"
        );
      }
    }
  }

  // ---- large history gap -------------------------------------------------

  private async handleLargeHistoryGap(
    watch: WatchWithMailbox,
    latestHistoryId: string
  ): Promise<void> {
    await this.emailWatchRepo.updateById(watch.id, { historyId: latestHistoryId });
    const gapSize = Number(BigInt(latestHistoryId) - BigInt(watch.historyId));
    await this.emailWatchHistoryRepo.create({
      id: nanoid(),
      emailWatchId: watch.id,
      historyId: latestHistoryId,
      notificationType: "HISTORY_GAP",
      processed: false,
      data: { oldHistoryId: watch.historyId, newHistoryId: latestHistoryId, gapSize },
    });
  }

  // ---- dedupe / record helpers (ported from services/pubsub/helper.ts) ----

  private async isHistoryIdProcessed(
    watchId: string,
    historyId: string
  ): Promise<boolean> {
    try {
      const watch = await this.emailWatchRepo.findById(watchId);
      if (!watch) return true;
      const watchHistoryId = parseInt(watch.historyId);
      const notificationHistoryId = parseInt(historyId);
      if (notificationHistoryId < watchHistoryId) return true;
      const processedHistory = await this.emailWatchHistoryRepo.findProcessed(
        watchId,
        notificationHistoryId.toString()
      );
      return !!processedHistory;
    } catch (error) {
      logger.error({ error, watchId, historyId }, "Error checking if history ID was processed");
      return true;
    }
  }

  private async isMessageProcessed(
    messageId: string,
    threadId: string
  ): Promise<boolean> {
    try {
      const processedMessage = await this.processedMessageRepo.findByMessageId(messageId);
      if (processedMessage) return true;

      const emailThread = await this.emailThreadRepo.findSequenceContactByThread(threadId);
      if (!emailThread) return false;

      const sequenceContact = await this.sequenceContactRepo.findBySequenceAndContact(
        emailThread.sequenceId,
        emailThread.contactId
      );
      if (!sequenceContact) return false;

      const finalStates = ["COMPLETED", "BOUNCED", "REPLIED", "OPTED_OUT", "UNSUBSCRIBED"];
      const isProcessed = finalStates.includes(sequenceContact.status);
      if (isProcessed) {
        await this.processedMessageRepo.create({
          messageId,
          threadId,
          type: sequenceContact.status,
        });
      }
      return isProcessed;
    } catch (error) {
      logger.error({ error, messageId, threadId }, "Error checking if message is processed");
      return false;
    }
  }

  private async createProcessedMessageRecord(
    messageId: string,
    threadId: string,
    type: NotificationType
  ): Promise<void> {
    try {
      await this.processedMessageRepo.create({
        messageId,
        threadId,
        type: type.toString(),
      });
    } catch (error: any) {
      // P2002 (unique constraint) is benign here — the message is already recorded.
      if (error?.code === "P2002") return;
      throw error;
    }
  }

  private async createOrUpdateWatchHistory(
    watchId: string,
    historyId: string,
    notificationType: NotificationType,
    data: any,
    isProcessed = false
  ): Promise<void> {
    await this.emailWatchHistoryRepo.upsert({
      id: nanoid(),
      emailWatchId: watchId,
      historyId: historyId.toString(),
      notificationType: notificationType.toString(),
      processed: isProcessed,
      data,
    });
  }
}
