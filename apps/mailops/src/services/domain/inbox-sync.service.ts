import { nanoid } from "nanoid";
import { backOff } from "exponential-backoff";
import {
  PubSubMessage,
  NotificationType,
  HistoryChange,
  GmailHistoryRecord,
  type MailboxWithAliasesRecord,
  type EmailWatchRecord,
} from "@coldjot/types";
import type { Db } from "@coldjot/database";
import { PUBSUB_CONFIG } from "@/config/pubsub/constants";
import { logger } from "@/lib/log";
import { fileLogger } from "@/lib/log/file-logger";

import { GmailInboxSource } from "@/adapters/gmail-inbox-source";
import type { InboxSource } from "@/adapters/inbox-source";
import {
  calculateHistoryGap,
  isLargeHistoryGap,
  hasMessageContent,
  isExternalSender,
  shouldProcessMessage,
  determineNotificationType,
} from "@/services/inbox-sync/classify";
import { applyClassification } from "@/services/inbox-sync/apply-classification";
import {
  isHistoryIdProcessed,
  isMessageProcessed,
  createProcessedMessageRecord,
  createOrUpdateWatchHistory,
} from "@/services/inbox-sync/records";
import { decodeNotification, sanitizeData } from "@/services/inbox-sync/decode";

/**
 * Domain service interface — handles a Gmail PubSub notification by syncing
 * inbox state (classify + apply). Phase 4c replaces PubSubHandler behind this
 * contract.
 */
export interface InboxSyncService {
  handleNotification(message: PubSubMessage): Promise<void>;
}

// Watch + mailbox lookup result

interface WatchWithMailbox extends EmailWatchRecord {
  mailbox: MailboxWithAliasesRecord;
}

// InboxSyncServiceImpl

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
    private readonly db: Db,
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
    const watch = await this.db.emailWatch.findByEmail(email);
    if (!watch) return null;

    const mailbox = await this.db.mailbox.findWithEmailAliases(email);
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
      if (
        await isHistoryIdProcessed(
          { emailWatch: this.db.emailWatch, emailWatchHistory: this.db.emailWatchHistory },
          watch.id,
          historyId
        )
      ) {
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
      await this.db.emailWatch.updateById(watch.id, {
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

        if (
          await isMessageProcessed(
            {
              processedMessage: this.db.processedMessage,
              emailThread: this.db.emailThread,
              sequenceContact: this.db.sequenceContact,
            },
            message.id,
            message.threadId
          )
        )
          continue;
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
          (tid) => this.db.processedMessage.hasOriginalForThread(tid)
        );

        const change: HistoryChange = {
          id: record.id,
          threadId: message.threadId,
          type: messageType,
          messageId: message.id,
          from: details.from,
        };

        await createProcessedMessageRecord(
          this.db.processedMessage,
          message.id,
          message.threadId,
          messageType
        );
        await createOrUpdateWatchHistory(
          this.db.emailWatchHistory,
          watch.id,
          response.historyId,
          messageType,
          {
            emailAddress: watch.mailbox.email,
            historyId: response.historyId,
            type: messageType,
            messageId: message.id,
            threadId: message.threadId,
          }
        );

        if (messageType === NotificationType.BOUNCE || messageType === NotificationType.REPLY) {
          await applyClassification({
            change,
            deps: {
              emailEvent: this.db.emailEvent,
              sequenceContact: this.db.sequenceContact,
              emailThread: this.db.emailThread,
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
    await this.db.emailWatch.updateById(watch.id, { historyId: latestHistoryId });
    const gapSize = Number(BigInt(latestHistoryId) - BigInt(watch.historyId));
    await this.db.emailWatchHistory.record({
      id: nanoid(),
      emailWatchId: watch.id,
      historyId: latestHistoryId,
      notificationType: "HISTORY_GAP",
      processed: false,
      data: { oldHistoryId: watch.historyId, newHistoryId: latestHistoryId, gapSize },
    });
  }
}
