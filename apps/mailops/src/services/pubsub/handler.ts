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
import { isBounceMessage } from "@/utils/email";
import { updateSequenceStats } from "@/lib/stats";
import { GMAIL_API } from "@/config/gmail/constants";

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

export class PubSubHandler {
  private readonly maxRetries = PUBSUB_CONFIG.MAX_RETRIES;
  private readonly backoffSeconds = PUBSUB_CONFIG.BACKOFF_SECONDS;

  async handleNotification(message: PubSubMessage): Promise<void> {
    try {
      this.logNotificationReceived(message);

      const notification = this.decodeNotification(message);

      const watch = await this.getWatchRecord(notification.emailAddress);

      if (!watch) {
        fileLogger.log(
          "warn",
          "No watch found for email address",
          this.sanitizeData({ emailAddress: notification.emailAddress })
        );
        return;
      }

      const notificationRecord = await this.createNotificationRecord(
        watch,
        notification
      );

      await this.processNotificationWithRetry(watch, notification);
      await this.markNotificationAsProcessed(notificationRecord.id);

      fileLogger.log(
        "info",
        "Successfully processed notification",
        this.sanitizeData({
          messageId: message.messageId,
          notificationId: notificationRecord.id,
        })
      );
    } catch (error) {
      this.handleError("Failed to process notification", error, {
        messageId: message.messageId,
      });
      throw error;
    }
  }

  private logNotificationReceived(message: PubSubMessage): void {
    fileLogger.log(
      "info",
      "Received PubSub notification",
      this.sanitizeData({
        messageId: message.messageId,
        publishTime: message.publishTime,
        attributes: message.attributes,
      })
    );
  }

  private sanitizeData(data: any): any {
    if (!data) return data;

    const sensitiveFields = [
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

    if (typeof data === "string") return data;
    if (Array.isArray(data)) return data.map((item) => this.sanitizeData(item));
    if (typeof data !== "object") return data;

    const sanitized = { ...data };
    for (const key in sanitized) {
      if (sensitiveFields.includes(key)) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof sanitized[key] === "object") {
        sanitized[key] = this.sanitizeData(sanitized[key]);
      }
    }
    return sanitized;
  }

  private handleError(
    message: string,
    error: unknown,
    context: any = {}
  ): void {
    fileLogger.log(
      "error",
      message,
      this.sanitizeData({
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        ...context,
      })
    );
  }

  private decodeNotification(message: PubSubMessage): DecodedNotification {
    try {
      logger.info(message, "Decoded notification");

      const decodedData = Buffer.from(message.data, "base64").toString();

      logger.info(decodedData, "Decoded data");

      const parsedData = JSON.parse(decodedData);

      logger.info(parsedData, "Parsed data");
      logger.info(
        `Parsed historyId: ${parsedData.historyId} && type: ${typeof parsedData.historyId}`
      );

      if (!this.isValidNotification(parsedData)) {
        throw new Error("Invalid notification format: missing required fields");
      }

      return parsedData;
    } catch (error) {
      this.handleError("Failed to decode notification data", error, {
        messageData: message.data,
      });
      throw new Error("Invalid notification format");
    }
  }

  private isValidNotification(data: any): data is DecodedNotification {
    return (
      typeof data === "object" &&
      data !== null &&
      typeof data.emailAddress === "string" &&
      (typeof data.historyId === "number" || typeof data.historyId === "string")
    );
  }

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
      this.sanitizeData({
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

      const record = await prisma.notificationHistory.create({
        data: {
          id: nanoid(),
          emailWatchId: watch.id,
          historyId: notification.historyId.toString(),
          notificationType: NotificationType.MESSAGE_ADDED,
          processed: false,
          data: {
            emailAddress: notification.emailAddress,
            historyId: notification.historyId,
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

  private async markNotificationAsProcessed(notificationId: string) {
    try {
      fileLogger.log("debug", "Marking notification as processed", {
        notificationId,
      });

      const result = await prisma.notificationHistory.update({
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

  private async processHistoryChanges(
    watch: WatchWithMailbox,
    historyId: string
  ): Promise<void> {
    try {
      fileLogger.log(
        "info",
        "Starting history changes processing",
        this.sanitizeData({
          watchEmail: watch.email,
          watchId: watch.id,
          historyId,
          currentHistoryId: watch.historyId,
        })
      );

      const accessToken = await this.getValidAccessToken(watch.mailbox);
      if (!accessToken) {
        fileLogger.log(
          "error",
          "Failed to get valid access token",
          this.sanitizeData({
            watchId: watch.id,
            mailboxId: watch.mailbox.id,
          })
        );
        return;
      }

      const currentHistoryId = BigInt(watch.historyId);
      const notificationHistoryId = BigInt(historyId);
      const historyGap = Number(notificationHistoryId - currentHistoryId);

      fileLogger.log("debug", "History gap analysis", {
        watchId: watch.id,
        currentHistoryId: currentHistoryId.toString(),
        notificationHistoryId: notificationHistoryId.toString(),
        historyGap,
      });

      // Use the lower history ID as the start point for negative gaps
      const startHistoryId =
        historyGap < 0
          ? notificationHistoryId.toString()
          : currentHistoryId.toString();

      if (Math.abs(historyGap) > 10000) {
        fileLogger.log("warn", "Large history gap detected", {
          watchId: watch.id,
          historyGap,
          currentHistoryId: currentHistoryId.toString(),
          notificationHistoryId: notificationHistoryId.toString(),
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
        this.sanitizeData({
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          watchId: watch.id,
          historyId,
        })
      );
      throw error;
    }
  }

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

      await prisma.notificationHistory.create({
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

  private async getMailbox(email: string) {
    const mailbox = await prisma.mailbox.findFirst({
      where: {
        email: email,
        isActive: true,
      },
    });

    if (!mailbox) {
      throw new Error(`No mailbox found for email: ${email}`);
    }

    return mailbox;
  }

  private async getValidAccessToken(mailbox: any) {
    return refreshTokenIfNeeded({
      mailboxId: mailbox.id,
      userId: mailbox.userId,
      accessToken: mailbox.access_token!,
      refreshToken: mailbox.refresh_token!,
      expiryDate: mailbox.expires_at!,
    });
  }

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
        threadId: data.threadId,
        from,
        subject,
        labelIds: data.labelIds || [],
        isReply: this.isReplyMessage(headers),
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

  private messageHasContent(message: GmailMessageMetadata): boolean {
    const hasMainBody = !!(
      message.payload.body && message.payload.body.size > 0
    );
    const hasPartContent = !!message.payload.parts?.some(
      (part) => part.body && part.body.size > 0
    );

    fileLogger.log(
      "debug",
      "Checking message content",
      this.sanitizeData({
        messageId: message.id,
        hasMainBody,
        hasPartContent,
        partsCount: message.payload.parts?.length || 0,
      })
    );

    return hasMainBody || hasPartContent;
  }

  private isExternalReply(from: string, watch: WatchWithMailbox): boolean {
    const userEmails = [
      watch.mailbox.email.toLowerCase(),
      ...watch.mailbox.aliases.map((alias) => alias.alias.toLowerCase()),
    ];

    const senderEmail =
      (from.match(/<(.+?)>/) || from.match(/([^<\s]+@[^>\s]+)/) || [])[1] ||
      from;
    const normalizedSender = senderEmail.toLowerCase().trim();

    fileLogger.log(
      "debug",
      "Checking if email is external",
      this.sanitizeData({
        userEmails,
        senderEmail: normalizedSender,
        isExternal: !userEmails.includes(normalizedSender),
        fromHeader: from,
        extractedEmail: senderEmail,
      })
    );

    return !userEmails.includes(normalizedSender);
  }

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

    for (const record of response.history || []) {
      // Process added messages
      if (record.messagesAdded) {
        for (const { message } of record.messagesAdded) {
          // Skip processing if message is a draft - check early to avoid unnecessary API calls
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
            changes.push({
              id: record.id,
              threadId: message.threadId,
              type: NotificationType.MESSAGE_ADDED,
              messageId: message.id,
              from: details.from,
            });
          }
        }
      }

      // Process label changes similarly
      if (record.labelsAdded) {
        for (const { message } of record.labelsAdded) {
          // Skip processing if message is a draft - check early to avoid unnecessary API calls
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
            changes.push({
              id: record.id,
              threadId: message.threadId,
              type: NotificationType.LABEL_ADDED,
              messageId: message.id,
              from: details.from,
            });
          }
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

  private isBounceMessage(details: MessageDetails): boolean {
    const { from, subject, headers } = details;
    const fromLower = from.toLowerCase();
    const subjectLower = subject.toLowerCase();

    // Common bounce sender patterns
    const bounceSenders = [
      "mailer-daemon",
      "postmaster",
      "mail delivery subsystem",
      "mail delivery system",
    ];

    // Common bounce subject patterns
    const bounceSubjects = [
      "delivery status notification",
      "failure notice",
      "returned mail",
      "undeliverable",
      "delivery failed",
      "mail delivery failed",
      "failure delivery",
    ];

    // Check for failed recipients header
    const hasFailedRecipients = headers.some(
      (h) => h.name.toLowerCase() === "x-failed-recipients" && h.value
    );

    // Check for delivery status report content type
    const isDeliveryStatusReport = headers.some(
      (h) =>
        h.name.toLowerCase() === "content-type" &&
        (h.value.toLowerCase().includes("delivery-status") ||
          h.value.toLowerCase().includes("multipart/report"))
    );

    // Log bounce detection criteria
    fileLogger.log("info", "Bounce detection check", {
      from,
      subject,
      hasFailedRecipients,
      isDeliveryStatusReport,
      matchesBounceFrom: bounceSenders.some((sender) =>
        fromLower.includes(sender)
      ),
      matchesBounceSubject: bounceSubjects.some((pattern) =>
        subjectLower.includes(pattern)
      ),
    });

    return (
      hasFailedRecipients ||
      isDeliveryStatusReport ||
      bounceSenders.some((sender) => fromLower.includes(sender)) ||
      bounceSubjects.some((pattern) => subjectLower.includes(pattern))
    );
  }

  private async processBounce(change: HistoryChange): Promise<void> {
    try {
      fileLogger.log(
        "debug",
        "Starting bounce processing",
        this.sanitizeData({
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
          this.sanitizeData({
            threadId: change.threadId,
            messageId: change.messageId,
          })
        );
        return;
      }

      fileLogger.log(
        "debug",
        "Found email thread for bounce",
        this.sanitizeData({
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
          this.sanitizeData({
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
        this.sanitizeData({
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          threadId: change.threadId,
          changeId: change.id,
        })
      );
      throw error;
    }
  }

  private async updateSequenceStatuses(
    changes: HistoryChange[]
  ): Promise<void> {
    try {
      fileLogger.log(
        "debug",
        "Starting sequence status updates",
        this.sanitizeData({
          totalChanges: changes.length,
          changeTypes: changes.map((c) => c.type),
        })
      );

      for (const change of changes) {
        fileLogger.log(
          "debug",
          "Processing change for status update",
          this.sanitizeData({
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

        const newStatus = this.determineNewStatus(change);

        if (!newStatus) {
          fileLogger.log("debug", "No status change needed", {
            threadId: change.threadId,
            currentType: change.type,
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
        this.sanitizeData({
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        })
      );
      throw error;
    }
  }

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

  private determineNewStatus(
    change: HistoryChange
  ): SequenceContactStatusEnum | null {
    fileLogger.log("debug", "Determining new status", {
      changeType: change.type,
      messageId: change.messageId,
    });

    let newStatus: SequenceContactStatusEnum | null = null;

    switch (change.type) {
      case NotificationType.REPLY:
        newStatus = SequenceContactStatusEnum.REPLIED;
        break;
      case NotificationType.BOUNCE:
        newStatus = SequenceContactStatusEnum.BOUNCED;
        break;
      default:
        newStatus = null;
    }

    fileLogger.log("debug", "Determined new status", {
      changeType: change.type,
      messageId: change.messageId,
      newStatus,
    });

    return newStatus;
  }

  private isReplyMessage(
    headers: Array<{ name: string; value: string }>
  ): boolean {
    return headers.some(
      (h: { name: string; value: string }) =>
        (h.name === "In-Reply-To" && h.value) ||
        (h.name === "References" && h.value) ||
        (h.name === "Subject" && h.value.toLowerCase().startsWith("re:"))
    );
  }
}
