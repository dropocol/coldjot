import { prisma } from "@coldjot/database";
import { nanoid } from "nanoid";
import { PUBSUB_CONFIG } from "../../config/pubsub/constants";
import {
  PubSubMessage,
  NotificationType,
  HistoryChange,
  GmailHistoryRecord,
  GmailMessageMetadata,
  DecodedNotification,
  MessageDetails,
} from "../../types/pubsub";
import { logger } from "@/lib/log";
import { backOff } from "exponential-backoff";
import { SequenceContactStatusEnum, EmailEventEnum } from "@coldjot/types";
import { refreshTokenIfNeeded } from "@/lib/google/gmail/helper";
import { Prisma, EmailWatch, Mailbox, EmailAlias } from "@prisma/client";
import { fileLogger } from "@/lib/log/file-logger";
import {
  isBounceMessage,
  shouldProcessMessage,
  hasMessageContent,
  isExternalSender,
  isReplyMessage,
} from "@/utils/email";
import { updateSequenceStats } from "@/lib/stats";
import { GMAIL_API } from "@/config/gmail/constants";
import {
  sanitizeData,
  decodeNotification,
  calculateHistoryGap,
  isLargeHistoryGap,
  determineNewStatus,
  formatError,
  isHistoryIdProcessed,
  isMessageProcessed,
  canUpdateSequenceContact,
  determineNotificationType,
  createProcessedMessageRecord,
  createOrUpdateWatchHistory,
} from "./helper";

interface GmailHistoryResponse {
  history: GmailHistoryRecord[];
  nextPageToken?: string;
  historyId: string;
}

interface WatchWithMailbox extends EmailWatch {
  mailbox: Mailbox & {
    aliases: EmailAlias[];
  };
}

// -----------------------------------------
// -----------------------------------------
// -----------------------------------------

export class PubSubHandler {
  private readonly maxRetries = PUBSUB_CONFIG.MAX_RETRIES;
  private readonly backoffSeconds = PUBSUB_CONFIG.BACKOFF_SECONDS;

  async handleNotification(message: PubSubMessage): Promise<void> {
    try {
      this.logNotificationReceived(message);
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

      // Skip creating initial PROCESSING record
      await this.processNotificationWithRetry(watch, notification);

      fileLogger.log(
        "info",
        "Successfully processed notification",
        sanitizeData({
          messageId: message.messageId,
        })
      );
    } catch (error) {
      this.handleError("Failed to process notification", error, {
        messageId: message.messageId,
      });
      throw error;
    }
  }

  // -----------------------------------------
  // -----------------------------------------
  // -----------------------------------------

  private logNotificationReceived(message: PubSubMessage): void {
    fileLogger.log(
      "info",
      "Received PubSub notification",
      sanitizeData({
        messageId: message.messageId,
        publishTime: message.publishTime,
        attributes: message.attributes,
      })
    );
  }

  // -----------------------------------------
  // -----------------------------------------
  // -----------------------------------------

  private handleError(
    message: string,
    error: unknown,
    context: any = {}
  ): void {
    fileLogger.log(
      "error",
      message,
      sanitizeData({
        ...formatError(error),
        ...context,
      })
    );
  }

  // -----------------------------------------
  // -----------------------------------------
  // -----------------------------------------

  private async getWatchRecord(
    email: string
  ): Promise<WatchWithMailbox | null> {
    fileLogger.log("debug", "Getting watch record", { email });

    const watch = await prisma.emailWatch.findFirst({
      where: { email },
    });

    if (!watch) {
      fileLogger.log("debug", "No watch record found", { email });
      return null;
    }

    const mailbox = await prisma.mailbox.findFirst({
      where: { email },
      include: {
        aliases: true,
      },
    });

    if (!mailbox) {
      fileLogger.log("warn", "No mailbox found for watch", {
        email,
        watchId: watch.id,
      });
      return null;
    }

    fileLogger.log(
      "debug",
      "Found watch record with mailbox",
      sanitizeData({
        watchId: watch.id,
        mailboxId: mailbox.id,
        hasAliases: mailbox.aliases.length > 0,
      })
    );

    return {
      ...watch,
      mailbox,
    };
  }

  // -----------------------------------------
  // -----------------------------------------
  // -----------------------------------------

  private async createNotificationRecord(watch: any, notification: any) {
    try {
      fileLogger.log("debug", "Creating notification record", {
        watchId: watch.id,
        historyId: notification.historyId,
      });

      if (!watch?.id || !notification?.historyId) {
        fileLogger.log(
          "error",
          "Missing required fields for notification record",
          {
            watch,
            notification,
          }
        );
        throw new Error("Missing required fields for notification record");
      }

      logger.info({}, "Creating notification record");
      const record = await prisma.emailWatchHistory.create({
        data: {
          id: nanoid(),
          emailWatchId: watch.id,
          historyId: notification.historyId.toString(),
          notificationType: NotificationType.PROCESSING,
          processed: false,
          data: {
            emailAddress: notification.emailAddress,
            historyId: notification.historyId,
            type: notification.type,
          },
        },
      });

      fileLogger.log("info", "Created notification record", {
        recordId: record.id,
        watchId: watch.id,
        historyId: notification.historyId,
      });

      return record;
    } catch (error) {
      fileLogger.log("error", "Failed to create notification record", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        watch,
        notification,
      });
      throw error;
    }
  }

  // -----------------------------------------
  // -----------------------------------------
  // -----------------------------------------

  private async processNotificationWithRetry(watch: any, notification: any) {
    fileLogger.log("debug", "Starting notification processing with retry", {
      watchId: watch.id,
      historyId: notification.historyId,
    });

    const backoffOptions = {
      numOfAttempts: this.maxRetries,
      startingDelay: this.backoffSeconds * 1000,
      maxDelay: this.backoffSeconds * 5000,
      jitter: "full" as const,
    };

    try {
      const result = await backOff(
        () => this.processHistoryChanges(watch, notification.historyId),
        backoffOptions
      );

      fileLogger.log("info", "Successfully processed notification with retry", {
        watchId: watch.id,
        historyId: notification.historyId,
      });

      return result;
    } catch (error) {
      fileLogger.log("error", "Failed to process notification after retries", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        watchId: watch.id,
        historyId: notification.historyId,
        maxRetries: this.maxRetries,
      });
      throw error;
    }
  }

  // -----------------------------------------
  // -----------------------------------------
  // -----------------------------------------

  private async markNotificationAsProcessed(notificationId: string) {
    try {
      fileLogger.log("debug", "Marking notification as processed", {
        notificationId,
      });

      const result = await prisma.emailWatchHistory.update({
        where: { id: notificationId },
        data: { processed: true },
      });

      fileLogger.log("info", "Marked notification as processed", {
        notificationId,
        success: true,
      });

      return result;
    } catch (error) {
      fileLogger.log("error", "Failed to mark notification as processed", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        notificationId,
      });
      throw error;
    }
  }

  // -----------------------------------------
  // -----------------------------------------
  // -----------------------------------------

  private async processHistoryChanges(
    watch: WatchWithMailbox,
    historyId: string
  ): Promise<void> {
    try {
      fileLogger.log(
        "info",
        "Starting history changes processing",
        sanitizeData({
          watchEmail: watch.email,
          watchId: watch.id,
          historyId,
          currentHistoryId: watch.historyId,
        })
      );

      // Check if this history ID has already been processed
      const isProcessed = await isHistoryIdProcessed(watch.id, historyId);
      if (isProcessed) {
        fileLogger.log("info", "History ID already processed, skipping", {
          watchId: watch.id,
          historyId,
        });
        return;
      }

      const accessToken = await this.getValidAccessToken(watch.mailbox);
      if (!accessToken) {
        fileLogger.log(
          "error",
          "Failed to get valid access token",
          sanitizeData({
            watchId: watch.id,
            mailboxId: watch.mailbox.id,
          })
        );
        return;
      }

      const { gap, startHistoryId } = calculateHistoryGap(
        watch.historyId,
        historyId
      );

      if (isLargeHistoryGap(gap)) {
        fileLogger.log("warn", "Large history gap detected", {
          watchId: watch.id,
          historyGap: gap,
          currentHistoryId: watch.historyId,
          notificationHistoryId: historyId,
        });

        await this.handleLargeHistoryGap(watch, historyId);
        return;
      }

      const response = await this.fetchGmailHistory(
        startHistoryId,
        accessToken
      );

      if (!response) {
        fileLogger.log("warn", "No history response received", {
          watchId: watch.id,
          historyId: startHistoryId,
        });

        await this.handleLargeHistoryGap(watch, historyId);
        return;
      }

      fileLogger.log("debug", "Processing Gmail history response", {
        watchId: watch.id,
        historyRecords: response.history?.length || 0,
        hasNextPage: !!response.nextPageToken,
        responseHistoryId: response.historyId,
      });

      if (response.history && response.history.length > 0) {
        const changes = await this.processHistoryRecords(response, watch);

        fileLogger.log("info", "Processed history records", {
          watchId: watch.id,
          totalChanges: changes.length,
          changeTypes: changes.map((c) => c.type),
        });

        if (changes.length > 0) {
          await this.updateSequenceStatuses(changes);
          fileLogger.log("info", "Updated sequence statuses", {
            watchId: watch.id,
            changesApplied: changes.length,
          });
        }
      }

      await prisma.emailWatch.update({
        where: { id: watch.id },
        data: {
          historyId: response.historyId,
          updatedAt: new Date(),
        },
      });

      fileLogger.log("info", "Updated watch history ID", {
        watchId: watch.id,
        oldHistoryId: watch.historyId,
        newHistoryId: response.historyId,
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

  // -----------------------------------------
  // -----------------------------------------
  // -----------------------------------------

  private async handleLargeHistoryGap(
    watch: WatchWithMailbox,
    latestHistoryId: string
  ): Promise<void> {
    try {
      fileLogger.log("info", "Handling large history gap", {
        watchId: watch.id,
        oldHistoryId: watch.historyId,
        newHistoryId: latestHistoryId,
        email: watch.email,
      });

      await prisma.emailWatch.update({
        where: { id: watch.id },
        data: {
          historyId: latestHistoryId,
          updatedAt: new Date(),
        },
      });

      fileLogger.log("info", "Updated watch history ID for large gap", {
        watchId: watch.id,
        oldHistoryId: watch.historyId,
        newHistoryId: latestHistoryId,
      });

      const gapSize = Number(BigInt(latestHistoryId) - BigInt(watch.historyId));

      await prisma.emailWatchHistory.create({
        data: {
          id: nanoid(),
          emailWatchId: watch.id,
          historyId: latestHistoryId,
          notificationType: "HISTORY_GAP",
          processed: false,
          data: {
            oldHistoryId: watch.historyId,
            newHistoryId: latestHistoryId,
            gapSize,
          },
        },
      });

      fileLogger.log("info", "Created history gap notification", {
        watchId: watch.id,
        email: watch.email,
        historyId: latestHistoryId,
        gapSize,
      });
    } catch (error) {
      fileLogger.log("error", "Failed to handle large history gap", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        watchId: watch.id,
        historyId: latestHistoryId,
      });
      throw error;
    }
  }

  // -----------------------------------------
  // -----------------------------------------
  // -----------------------------------------

  private async getValidAccessToken(mailbox: any) {
    return refreshTokenIfNeeded({
      mailboxId: mailbox.id,
      userId: mailbox.userId,
      accessToken: mailbox.access_token!,
      refreshToken: mailbox.refresh_token!,
      expiryDate: mailbox.expires_at!,
    });
  }

  // -----------------------------------------
  // -----------------------------------------
  // -----------------------------------------

  private async fetchGmailHistory(
    historyId: string,
    accessToken: string
  ): Promise<GmailHistoryResponse> {
    try {
      // Remove label filtering to get ALL changes
      const url = `${GMAIL_API.HISTORY}?startHistoryId=${historyId}&historyTypes=messageAdded&historyTypes=labelAdded&historyTypes=labelRemoved`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch history: ${response.statusText}`);
      }

      const data = await response.json();
      return data as GmailHistoryResponse;
    } catch (error) {
      logger.error({ error }, "Failed to fetch Gmail history");
      throw error;
    }
  }

  // -----------------------------------------
  // -----------------------------------------
  // -----------------------------------------

  private async fetchMessageDetails(
    messageId: string,
    accessToken: string,
    mailbox: { email: string; id: string }
  ): Promise<MessageDetails | null> {
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

  // -----------------------------------------
  // -----------------------------------------
  // -----------------------------------------

  private async processHistoryRecords(
    response: GmailHistoryResponse,
    watch: WatchWithMailbox
  ): Promise<HistoryChange[]> {
    const changes: HistoryChange[] = [];
    const accessToken = await this.getValidAccessToken(watch.mailbox);

    if (!accessToken) {
      throw new Error("No valid access token available");
    }

    logger.info(
      {
        mailboxId: watch.mailbox.id,
        mailboxEmail: watch.mailbox.email,
        historyRecordsCount: response.history?.length || 0,
      },
      "Processing history records"
    );

    const userEmails = [
      watch.mailbox.email.toLowerCase(),
      ...watch.mailbox.aliases.map((alias) => alias.alias.toLowerCase()),
    ];

    const processedMessageIds = new Set<string>(); // Track processed messages in this batch

    for (const record of response.history || []) {
      // Combine messages from both messagesAdded and labelsAdded
      const messages = [
        ...(record.messagesAdded || []).map((m) => m.message),
        ...(record.labelsAdded || []).map((m) => m.message),
      ];

      // Process unique messages only
      for (const message of messages) {
        // Skip if already processed in this batch
        if (processedMessageIds.has(message.id)) {
          continue;
        }
        processedMessageIds.add(message.id);

        // Skip if message already processed in database
        const isAlreadyProcessed = await isMessageProcessed(
          message.id,
          message.threadId
        );
        if (isAlreadyProcessed) {
          logger.info(
            {
              messageId: message.id,
              threadId: message.threadId,
              mailboxId: watch.mailbox.id,
            },
            "Message already processed, skipping"
          );
          continue;
        }

        // Skip processing if message is a draft
        if (message.labelIds.includes("DRAFT")) {
          logger.debug(
            {
              messageId: message.id,
              mailboxId: watch.mailbox.id,
              mailboxEmail: watch.mailbox.email,
            },
            "Skipping draft message"
          );
          continue;
        }

        const details = await this.fetchMessageDetails(
          message.id,
          accessToken,
          {
            id: watch.mailbox.id,
            email: watch.mailbox.email,
          }
        );

        if (details) {
          // First check if the message has content
          const hasContent = hasMessageContent(details.headers);
          if (!hasContent) {
            logger.debug(
              {
                messageId: message.id,
                mailboxId: watch.mailbox.id,
                mailboxEmail: watch.mailbox.email,
              },
              "Skipping empty message"
            );
            continue;
          }

          // Determine the message type based on the history record and message details
          const messageType = await determineNotificationType(
            details,
            userEmails,
            message.threadId
          );

          const change = {
            id: record.id,
            threadId: message.threadId,
            type: messageType,
            messageId: message.id,
            from: details.from,
          };

          changes.push(change);

          // Create processed message record
          await createProcessedMessageRecord(
            message.id,
            message.threadId,
            messageType
          );

          // Update watch history with the correct notification type
          await createOrUpdateWatchHistory(
            watch.id,
            response.historyId,
            messageType,
            {
              emailAddress: watch.mailbox.email,
              historyId: response.historyId,
              type: messageType,
              messageId: message.id,
              threadId: message.threadId,
            },
            true // Mark as processed since we've handled it
          );

          // If it's a bounce, process it immediately
          if (messageType === NotificationType.BOUNCE) {
            await this.processBounce(change);
          } else if (messageType === NotificationType.REPLY) {
            await this.processReply(change);
          }

          // Log final decision with all relevant information
          logger.info(
            {
              messageId: message.id,
              from: details.from,
              userId: watch.mailbox.userId,
              isExternal: isExternalSender(details.from, userEmails),
              isReply: messageType === NotificationType.REPLY,
              isBounced: messageType === NotificationType.BOUNCE,
              isOriginal: messageType === NotificationType.ORIGINAL_MESSAGE,
              hasContent,
              finalType: messageType,
              classification: {
                isExternal: isExternalSender(details.from, userEmails),
                isReply: messageType === NotificationType.REPLY,
                isBounced: messageType === NotificationType.BOUNCE,
                isOriginal: messageType === NotificationType.ORIGINAL_MESSAGE,
                hasContent,
                shouldProcess: shouldProcessMessage(message.labelIds),
              },
            },
            "Message classification complete"
          );
        }
      }
    }

    logger.info(
      {
        mailboxId: watch.mailbox.id,
        mailboxEmail: watch.mailbox.email,
        totalChanges: changes.length,
        changeTypes: changes.map((c) => c.type),
      },
      "Completed processing history records"
    );

    return changes;
  }

  // -----------------------------------------
  // -----------------------------------------
  // -----------------------------------------

  private async processBounce(change: HistoryChange): Promise<void> {
    try {
      fileLogger.log(
        "debug",
        "Starting bounce processing",
        sanitizeData({
          changeId: change.id,
          threadId: change.threadId,
          messageId: change.messageId,
        })
      );

      const emailThread = await prisma.emailThread.findUnique({
        where: { threadId: change.threadId },
        include: {
          sequence: true,
        },
      });

      if (!emailThread) {
        fileLogger.log(
          "warn",
          "No email thread found for bounce",
          sanitizeData({
            threadId: change.threadId,
            messageId: change.messageId,
          })
        );
        return;
      }

      fileLogger.log(
        "debug",
        "Found email thread for bounce",
        sanitizeData({
          threadId: change.threadId,
          sequenceId: emailThread.sequenceId,
          contactId: emailThread.contactId,
        })
      );

      const existingBounce = await prisma.emailEvent.findFirst({
        where: {
          sequenceId: emailThread.sequenceId,
          contactId: emailThread.contactId,
          type: EmailEventEnum.BOUNCED,
        },
      });

      if (existingBounce) {
        fileLogger.log(
          "debug",
          "Bounce already recorded",
          sanitizeData({
            threadId: change.threadId,
            sequenceId: emailThread.sequenceId,
            contactId: emailThread.contactId,
            existingBounceId: existingBounce.id,
          })
        );
        return;
      }

      const sentEvent = await prisma.emailEvent.findFirst({
        where: {
          sequenceId: emailThread.sequenceId,
          contactId: emailThread.contactId,
          type: EmailEventEnum.SENT,
        },
      });

      if (!sentEvent) {
        fileLogger.log("warn", "No sent event found for bounce", {
          threadId: change.threadId,
          sequenceId: emailThread.sequenceId,
          contactId: emailThread.contactId,
        });
        return;
      }

      fileLogger.log("debug", "Found sent event for bounce", {
        sentEventId: sentEvent.id,
        trackingId: sentEvent.trackingId,
      });

      const bounceEvent = await prisma.emailEvent.create({
        data: {
          type: EmailEventEnum.BOUNCED,
          sequenceId: emailThread.sequenceId,
          contactId: emailThread.contactId,
          trackingId: sentEvent.trackingId,
          metadata: {
            messageId: change.messageId,
            threadId: change.threadId,
            bounceReason: "Email delivery failed",
          },
        },
      });

      fileLogger.log("info", "Created bounce event", {
        bounceEventId: bounceEvent.id,
        sequenceId: emailThread.sequenceId,
        contactId: emailThread.contactId,
      });

      const updateResult = await prisma.sequenceContact.updateMany({
        where: {
          sequenceId: emailThread.sequenceId,
          contactId: emailThread.contactId,
          status: {
            notIn: [
              SequenceContactStatusEnum.COMPLETED,
              SequenceContactStatusEnum.BOUNCED,
              SequenceContactStatusEnum.OPTED_OUT,
            ],
          },
        },
        data: {
          status: SequenceContactStatusEnum.BOUNCED,
          completed: true,
          completedAt: new Date(),
          updatedAt: new Date(),
          nextScheduledAt: null,
        },
      });

      fileLogger.log("info", "Updated sequence contact status", {
        threadId: change.threadId,
        sequenceId: emailThread.sequenceId,
        contactId: emailThread.contactId,
        updatedCount: updateResult.count,
      });

      await updateSequenceStats(
        emailThread.sequenceId,
        EmailEventEnum.BOUNCED,
        emailThread.contactId
      );

      fileLogger.log("info", "Successfully processed bounce", {
        threadId: change.threadId,
        sequenceId: emailThread.sequenceId,
        contactId: emailThread.contactId,
        bounceEventId: bounceEvent.id,
        statusUpdated: updateResult.count > 0,
      });
    } catch (error) {
      fileLogger.log(
        "error",
        "Failed to process bounce",
        sanitizeData({
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          threadId: change.threadId,
          changeId: change.id,
        })
      );
      throw error;
    }
  }

  // -----------------------------------------
  // -----------------------------------------
  // -----------------------------------------

  private async processReply(change: HistoryChange): Promise<void> {
    try {
      fileLogger.log(
        "debug",
        "Starting reply processing",
        sanitizeData({
          changeId: change.id,
          threadId: change.threadId,
          messageId: change.messageId,
        })
      );

      const emailThread = await prisma.emailThread.findUnique({
        where: { threadId: change.threadId },
        include: {
          sequence: true,
        },
      });

      if (!emailThread) {
        fileLogger.log(
          "warn",
          "No email thread found for reply",
          sanitizeData({
            threadId: change.threadId,
            messageId: change.messageId,
          })
        );
        return;
      }

      fileLogger.log(
        "debug",
        "Found email thread for reply",
        sanitizeData({
          threadId: change.threadId,
          sequenceId: emailThread.sequenceId,
          contactId: emailThread.contactId,
        })
      );

      const existingReply = await prisma.emailEvent.findFirst({
        where: {
          sequenceId: emailThread.sequenceId,
          contactId: emailThread.contactId,
          type: EmailEventEnum.REPLIED,
        },
      });

      if (existingReply) {
        fileLogger.log(
          "debug",
          "Reply already recorded",
          sanitizeData({
            threadId: change.threadId,
            sequenceId: emailThread.sequenceId,
            contactId: emailThread.contactId,
            existingReplyId: existingReply.id,
          })
        );
        return;
      }

      const sentEvent = await prisma.emailEvent.findFirst({
        where: {
          sequenceId: emailThread.sequenceId,
          contactId: emailThread.contactId,
          type: EmailEventEnum.SENT,
        },
      });

      if (!sentEvent) {
        fileLogger.log("warn", "No sent event found for reply", {
          threadId: change.threadId,
          sequenceId: emailThread.sequenceId,
          contactId: emailThread.contactId,
        });
        return;
      }

      fileLogger.log("debug", "Found sent event for reply", {
        sentEventId: sentEvent.id,
        trackingId: sentEvent.trackingId,
      });

      const replyEvent = await prisma.emailEvent.create({
        data: {
          type: EmailEventEnum.REPLIED,
          sequenceId: emailThread.sequenceId,
          contactId: emailThread.contactId,
          trackingId: sentEvent.trackingId,
          metadata: {
            messageId: change.messageId,
            threadId: change.threadId,
            from: change.from,
          },
        },
      });

      fileLogger.log("info", "Created reply event", {
        replyEventId: replyEvent.id,
        sequenceId: emailThread.sequenceId,
        contactId: emailThread.contactId,
      });

      const updateResult = await prisma.sequenceContact.updateMany({
        where: {
          sequenceId: emailThread.sequenceId,
          contactId: emailThread.contactId,
          status: {
            notIn: [
              SequenceContactStatusEnum.COMPLETED,
              SequenceContactStatusEnum.BOUNCED,
              SequenceContactStatusEnum.OPTED_OUT,
            ],
          },
        },
        data: {
          status: SequenceContactStatusEnum.REPLIED,
          completed: true,
          completedAt: new Date(),
          updatedAt: new Date(),
          nextScheduledAt: null,
        },
      });

      fileLogger.log("info", "Updated sequence contact status", {
        threadId: change.threadId,
        sequenceId: emailThread.sequenceId,
        contactId: emailThread.contactId,
        updatedCount: updateResult.count,
      });

      await updateSequenceStats(
        emailThread.sequenceId,
        EmailEventEnum.REPLIED,
        emailThread.contactId
      );

      fileLogger.log("info", "Successfully processed reply", {
        threadId: change.threadId,
        sequenceId: emailThread.sequenceId,
        contactId: emailThread.contactId,
        replyEventId: replyEvent.id,
        statusUpdated: updateResult.count > 0,
      });
    } catch (error) {
      fileLogger.log(
        "error",
        "Failed to process reply",
        sanitizeData({
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          threadId: change.threadId,
          changeId: change.id,
        })
      );
      throw error;
    }
  }

  // -----------------------------------------
  // -----------------------------------------
  // -----------------------------------------

  private async updateSequenceStatuses(
    changes: HistoryChange[]
  ): Promise<void> {
    try {
      fileLogger.log(
        "debug",
        "Starting sequence status updates",
        sanitizeData({
          totalChanges: changes.length,
          changeTypes: changes.map((c) => c.type),
        })
      );

      for (const change of changes) {
        fileLogger.log(
          "debug",
          "Processing change for status update",
          sanitizeData({
            changeId: change.id,
            threadId: change.threadId,
            type: change.type,
            messageId: change.messageId,
          })
        );

        const sequenceContact = await this.findSequenceContact(change.threadId);

        if (!sequenceContact) {
          fileLogger.log("debug", "No sequence contact found for thread", {
            threadId: change.threadId,
            messageId: change.messageId,
          });
          continue;
        }

        fileLogger.log("debug", "Found sequence contact", {
          sequenceContactId: sequenceContact.id,
          contactId: sequenceContact.contactId,
          sequenceId: sequenceContact.sequenceId,
          currentStatus: sequenceContact.status,
        });

        const newStatus = determineNewStatus(change.type);

        if (!newStatus) {
          fileLogger.log("debug", "No status change needed", {
            threadId: change.threadId,
            currentType: change.type,
          });
          continue;
        }

        // Check if we can update the sequence contact
        const canUpdate = await canUpdateSequenceContact(
          sequenceContact.sequenceId,
          sequenceContact.contactId,
          newStatus
        );

        if (!canUpdate) {
          fileLogger.log("debug", "Sequence contact cannot be updated", {
            threadId: change.threadId,
            sequenceContactId: sequenceContact.id,
            currentStatus: sequenceContact.status,
            newStatus,
          });
          continue;
        }

        fileLogger.log("info", "Updating sequence contact status", {
          sequenceContactId: sequenceContact.id,
          oldStatus: sequenceContact.status,
          newStatus: newStatus,
          threadId: change.threadId,
        });

        await prisma.sequenceContact.update({
          where: { id: sequenceContact.id },
          data: {
            status: newStatus,
            completed: true,
            completedAt: new Date(),
            nextScheduledAt: null,
          },
        });

        fileLogger.log("info", "Successfully updated sequence contact status", {
          sequenceContactId: sequenceContact.id,
          newStatus,
          threadId: change.threadId,
        });
      }

      fileLogger.log("info", "Completed all sequence status updates", {
        totalChanges: changes.length,
      });
    } catch (error) {
      fileLogger.log(
        "error",
        "Failed to update sequence statuses",
        sanitizeData({
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        })
      );
      throw error;
    }
  }

  // -----------------------------------------
  // -----------------------------------------
  // -----------------------------------------

  private async findSequenceContact(threadId: string) {
    try {
      fileLogger.log("debug", "Finding sequence contact for thread", {
        threadId,
      });

      const emailThread = await prisma.emailThread.findUnique({
        where: { threadId },
        include: {
          sequence: true,
        },
      });

      if (!emailThread) {
        fileLogger.log("debug", "No email thread found", { threadId });
        return null;
      }

      fileLogger.log("debug", "Found email thread", {
        threadId,
        sequenceId: emailThread.sequenceId,
        contactId: emailThread.contactId,
      });

      const sequenceContact = await prisma.sequenceContact.findUnique({
        where: {
          sequenceId_contactId: {
            sequenceId: emailThread.sequenceId,
            contactId: emailThread.contactId,
          },
        },
      });

      if (sequenceContact) {
        fileLogger.log("debug", "Found sequence contact", {
          threadId,
          sequenceContactId: sequenceContact.id,
          status: sequenceContact.status,
        });
      } else {
        fileLogger.log("debug", "No sequence contact found", {
          threadId,
          sequenceId: emailThread.sequenceId,
          contactId: emailThread.contactId,
        });
      }

      return sequenceContact;
    } catch (error) {
      fileLogger.log("error", "Error finding sequence contact", {
        threadId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });
      return null;
    }
  }
}
