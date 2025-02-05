import { prisma } from "@coldjot/database";
import { nanoid } from "nanoid";
import { PUBSUB_CONFIG } from "../../config/pubsub/constants";
import {
  PubSubMessage,
  NotificationType,
  HistoryChange,
  GmailHistoryRecord,
  GmailMessageMetadata,
} from "../../types/pubsub";
import { logger } from "@/lib/log";
import { backOff } from "exponential-backoff";
import { SequenceContactStatusEnum } from "@coldjot/types";
import { refreshTokenIfNeeded } from "@/lib/google/gmail/helper";
import { Prisma, EmailWatch, Mailbox, EmailAlias } from "@prisma/client";
import { fileLogger } from "@/lib/log/file-logger";

interface GmailHistoryResponse {
  history: GmailHistoryRecord[];
  nextPageToken?: string;
  historyId: string;
}

interface MessageDetails {
  id: string;
  threadId: string;
  from: string;
  labelIds: string[];
  isReply: boolean;
}

interface WatchWithMailbox extends EmailWatch {
  mailbox: Mailbox & {
    aliases: EmailAlias[];
  };
}

export class PubSubHandler {
  async handleNotification(message: PubSubMessage): Promise<void> {
    try {
      const notification = this.decodeNotification(message);
      const watch = await this.getWatchRecord(notification.emailAddress);

      if (!watch) {
        logger.warn(
          { emailAddress: notification.emailAddress },
          "No watch found for email address"
        );
        return;
      }

      logger.info({ watch, notification }, "Processing notification for watch");

      const notificationRecord = await this.createNotificationRecord(
        watch,
        notification
      );
      await this.processNotificationWithRetry(watch, notification);
      await this.markNotificationAsProcessed(notificationRecord.id);

      logger.info(
        { messageId: message.messageId },
        "Successfully processed notification"
      );
    } catch (error) {
      logger.error(
        { error, messageId: message.messageId },
        "Failed to process notification"
      );
      throw error;
    }
  }

  private decodeNotification(message: PubSubMessage) {
    try {
      const decodedData = Buffer.from(message.data, "base64").toString();
      logger.info({ decodedData }, "Decoded notification data");
      return JSON.parse(decodedData) as {
        emailAddress: string;
        historyId: string;
      };
    } catch (error) {
      logger.error({ error }, "Failed to decode notification data");
      throw new Error("Invalid notification format");
    }
  }

  private async getWatchRecord(
    email: string
  ): Promise<WatchWithMailbox | null> {
    const watch = await prisma.emailWatch.findFirst({
      where: { email },
    });

    if (!watch) return null;

    // Get the mailbox separately since there's no direct relation
    const mailbox = await prisma.mailbox.findFirst({
      where: { email },
      include: {
        aliases: true,
      },
    });

    if (!mailbox) return null;

    return {
      ...watch,
      mailbox,
    };
  }

  private async createNotificationRecord(watch: any, notification: any) {
    return prisma.notificationHistory.create({
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
  }

  private async processNotificationWithRetry(watch: any, notification: any) {
    const backoffOptions = {
      numOfAttempts: PUBSUB_CONFIG.MAX_RETRIES,
      startingDelay: PUBSUB_CONFIG.BACKOFF_SECONDS * 1000,
      maxDelay: PUBSUB_CONFIG.BACKOFF_SECONDS * 5000,
      jitter: "full" as const,
    };

    return backOff(
      () => this.processHistoryChanges(watch, notification.historyId),
      backoffOptions
    );
  }

  private async markNotificationAsProcessed(notificationId: string) {
    return prisma.notificationHistory.update({
      where: { id: notificationId },
      data: { processed: true },
    });
  }

  private async processHistoryChanges(
    watch: WatchWithMailbox,
    historyId: string
  ): Promise<void> {
    try {
      const mailbox = await this.getMailbox(watch.email);
      const accessToken = await this.getValidAccessToken(mailbox);

      // Compare historyIds
      const currentWatchHistoryId = BigInt(watch.historyId);
      const notificationHistoryId = BigInt(historyId);

      // Log detailed history comparison
      fileLogger.log("debug", "Comparing history IDs", {
        currentWatchHistoryId: currentWatchHistoryId.toString(),
        notificationHistoryId: notificationHistoryId.toString(),
        watchEmail: watch.email,
        watchId: watch.id,
      });

      if (notificationHistoryId < currentWatchHistoryId) {
        const logData = {
          watchHistoryId: watch.historyId,
          notificationHistoryId: historyId,
          watchEmail: watch.email,
          watchId: watch.id,
        };
        logger.warn(logData, "Received old history ID, skipping");
        fileLogger.log("warn", "Received old history ID, skipping", logData);
        return;
      }

      const historyResponse = await this.fetchGmailHistory(
        historyId,
        accessToken
      );

      // Log history response details
      fileLogger.log("debug", "Received Gmail history response", {
        historyId,
        newHistoryId: historyResponse.historyId,
        hasHistory: historyResponse.history?.length > 0,
        historyCount: historyResponse.history?.length || 0,
        nextPageToken: historyResponse.nextPageToken,
        watchEmail: watch.email,
        watchId: watch.id,
      });

      if (!historyResponse.history || historyResponse.history.length === 0) {
        const logData = {
          watchHistoryId: watch.historyId,
          notificationHistoryId: historyId,
          responseHistoryId: historyResponse.historyId,
          watchEmail: watch.email,
          watchId: watch.id,
        };
        logger.warn(logData, "No history found for the given historyId");
        fileLogger.log(
          "warn",
          "No history found for the given historyId",
          logData
        );

        // Update watch record with latest historyId to prevent future gaps
        await prisma.emailWatch.update({
          where: { id: watch.id },
          data: {
            historyId: historyResponse.historyId,
            updatedAt: new Date(),
          },
        });

        fileLogger.log("info", "Updated watch record with latest historyId", {
          watchId: watch.id,
          oldHistoryId: watch.historyId,
          newHistoryId: historyResponse.historyId,
        });

        return;
      }

      const changes = await this.processHistoryRecords(historyResponse, watch);

      if (changes.length > 0) {
        const logData = {
          changes,
          historyId,
          newHistoryId: historyResponse.historyId,
          changesCount: changes.length,
          watchEmail: watch.email,
          watchId: watch.id,
        };
        logger.info(logData, "Processed history changes");
        fileLogger.log("info", "Processed history changes", logData);

        await this.updateSequenceStatuses(changes);
      } else {
        const logData = {
          historyId,
          newHistoryId: historyResponse.historyId,
          watchEmail: watch.email,
          watchId: watch.id,
        };
        logger.info(logData, "No relevant changes found in history");
        fileLogger.log("info", "No relevant changes found in history", logData);
      }

      // Update watch record with latest historyId
      await prisma.emailWatch.update({
        where: { id: watch.id },
        data: {
          historyId: historyResponse.historyId,
          updatedAt: new Date(),
        },
      });

      fileLogger.log("info", "Updated watch record with latest historyId", {
        watchId: watch.id,
        oldHistoryId: watch.historyId,
        newHistoryId: historyResponse.historyId,
      });
    } catch (error) {
      const logData = { error, email: watch.email, historyId };
      logger.error(logData, "Failed to process history changes");
      fileLogger.log("error", "Failed to process history changes", {
        ...logData,
        errorStack: error instanceof Error ? error.stack : undefined,
        errorMessage: error instanceof Error ? error.message : String(error),
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

  private async fetchGmailHistory(historyId: string, accessToken: string) {
    logger.info({ historyId }, "Fetching Gmail history");

    const url = new URL(
      "https://gmail.googleapis.com/gmail/v1/users/me/history"
    );
    url.searchParams.append("startHistoryId", historyId);
    // Add labelId filter to only get INBOX changes
    url.searchParams.append("labelId", "INBOX");
    // Add maxResults to get more history items
    url.searchParams.append("maxResults", "100");

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      // Check for specific error cases
      if (response.status === 404) {
        logger.warn({ historyId }, "History ID not found - might be too old");
        // You might want to handle this by re-syncing the watch
        throw new Error("History ID not found - too old");
      }

      throw new Error(
        `Failed to fetch history: ${response.statusText}. Details: ${JSON.stringify(
          errorData
        )}`
      );
    }

    const data = (await response.json()) as GmailHistoryResponse;

    logger.info(
      {
        historyId,
        newHistoryId: data.historyId,
        hasHistory: data.history?.length > 0,
        historyCount: data.history?.length || 0,
        nextPageToken: data.nextPageToken,
      },
      "Gmail history response details"
    );

    return data;
  }

  private async fetchMessageDetails(
    messageId: string,
    accessToken: string
  ): Promise<MessageDetails | null> {
    try {
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorMessage = `Failed to fetch message details: ${response.statusText}`;
        fileLogger.log("error", errorMessage, {
          messageId,
          statusCode: response.status,
          statusText: response.statusText,
        });
        throw new Error(errorMessage);
      }

      const data = (await response.json()) as GmailMessageMetadata;

      // Check if message has content
      const hasContent = this.messageHasContent(data);
      if (!hasContent) {
        fileLogger.log("warn", "Message has no content, skipping", {
          messageId,
          labelIds: data.labelIds,
          threadId: data.threadId,
        });
        return null;
      }

      const fromHeader = data.payload.headers.find((h) => h.name === "From");
      const inReplyToHeader = data.payload.headers.find(
        (h) => h.name === "In-Reply-To"
      );
      const references = data.payload.headers.find(
        (h) => h.name === "References"
      );
      const subject = data.payload.headers.find((h) => h.name === "Subject");

      const from = fromHeader ? fromHeader.value : "";
      const isReply = !!(
        inReplyToHeader ||
        references ||
        (subject?.value || "").toLowerCase().startsWith("re:")
      );

      // Log detailed header information
      fileLogger.log("debug", "Message headers analysis", {
        messageId,
        hasInReplyTo: !!inReplyToHeader,
        hasReferences: !!references,
        subject: subject?.value,
        isReplyBySubject: (subject?.value || "")
          .toLowerCase()
          .startsWith("re:"),
        isReply,
        from,
        inReplyToHeader,
        references: references?.value,
      });

      const messageDetails = {
        id: data.id,
        threadId: data.threadId,
        from,
        labelIds: data.labelIds || [],
        isReply,
      };

      return messageDetails;
    } catch (error) {
      const logData = {
        error,
        messageId,
        errorStack: error instanceof Error ? error.stack : undefined,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
      logger.error(logData, "Failed to fetch message details");
      fileLogger.log("error", "Failed to fetch message details", logData);
      return null;
    }
  }

  private messageHasContent(message: GmailMessageMetadata): boolean {
    // Check main body
    if (message.payload.body && message.payload.body.size > 0) {
      return true;
    }

    // Check parts (multipart messages)
    if (
      message.payload.parts?.some((part) => part.body && part.body.size > 0)
    ) {
      return true;
    }

    return false;
  }

  private isExternalReply(from: string, watch: WatchWithMailbox): boolean {
    const userEmails = [
      watch.mailbox.email.toLowerCase(),
      ...watch.mailbox.aliases.map((alias) => alias.alias.toLowerCase()),
    ];

    // Extract email from different formats:
    // 1. "John Doe <john@example.com>"
    // 2. john@example.com
    const senderEmail =
      (from.match(/<(.+?)>/) || from.match(/([^<\s]+@[^>\s]+)/) || [])[1] ||
      from;

    // Normalize to lowercase for comparison
    const normalizedSender = senderEmail.toLowerCase().trim();

    // Log the email comparison details
    fileLogger.log("debug", "Checking if email is external", {
      userEmails,
      senderEmail: normalizedSender,
      isExternal: !userEmails.includes(normalizedSender),
      fromHeader: from,
      extractedEmail: senderEmail,
    });

    return !userEmails.includes(normalizedSender);
  }

  private async processHistoryRecords(
    response: GmailHistoryResponse,
    watch: WatchWithMailbox
  ): Promise<HistoryChange[]> {
    const changes: HistoryChange[] = [];
    const accessToken = await this.getValidAccessToken(watch.mailbox);

    // Log raw history records for debugging
    fileLogger.log("debug", "Raw history records", {
      records: response.history?.map((record) => ({
        id: record.id,
        messagesAdded: record.messagesAdded?.length || 0,
        labelsAdded: record.labelsAdded?.length || 0,
        messages: record.messages?.length || 0,
        // Add any other fields present in the records
        hasMessages: !!record.messages,
        hasMessagesAdded: !!record.messagesAdded,
        hasLabelsAdded: !!record.labelsAdded,
        raw: record, // Log the entire record for inspection
      })),
      watchEmail: watch.email,
      watchId: watch.id,
    });

    // Log the total messages being processed
    fileLogger.log("debug", "Processing history records", {
      totalRecords: response.history?.length || 0,
      messagesAdded: response.history?.reduce(
        (count, record) => count + (record.messagesAdded?.length || 0),
        0
      ),
      labelsAdded: response.history?.reduce(
        (count, record) => count + (record.labelsAdded?.length || 0),
        0
      ),
      messages: response.history?.reduce(
        (count, record) => count + (record.messages?.length || 0),
        0
      ),
      watchEmail: watch.email,
      watchId: watch.id,
    });

    for (const record of response.history || []) {
      // First check messages array which might contain modified messages
      if (record.messages) {
        for (const message of record.messages) {
          const messageDetails = await this.fetchMessageDetails(
            message.id,
            accessToken
          );

          // Log raw message details for debugging
          fileLogger.log("debug", "Raw message from messages array", {
            messageId: message.id,
            messageDetails,
            threadId: message.threadId,
            labelIds: message.labelIds,
            watchEmail: watch.email,
            watchId: watch.id,
          });

          if (messageDetails) {
            const isExternal = this.isExternalReply(messageDetails.from, watch);

            // Log detailed processing info
            fileLogger.log("debug", "Processing message from messages array", {
              messageId: messageDetails.id,
              threadId: messageDetails.threadId,
              from: messageDetails.from,
              isReply: messageDetails.isReply,
              isExternal,
              labelIds: messageDetails.labelIds,
              watchEmail: watch.email,
              watchAliases: watch.mailbox.aliases.map((a) => a.alias),
              skipped: !messageDetails.isReply || !isExternal,
              skipReason: !messageDetails.isReply
                ? "not a reply"
                : !isExternal
                  ? "not from external sender"
                  : null,
            });

            if (messageDetails.isReply && isExternal) {
              changes.push({
                id: nanoid(),
                threadId: messageDetails.threadId,
                type: NotificationType.REPLY,
                messageId: messageDetails.id,
                labelIds: messageDetails.labelIds,
                from: messageDetails.from,
              });
            }
          }
        }
      }

      // Then check messagesAdded array (existing code)
      if (record.messagesAdded) {
        for (const messageAdded of record.messagesAdded) {
          const messageDetails = await this.fetchMessageDetails(
            messageAdded.message.id,
            accessToken
          );

          // Log raw message details for debugging
          fileLogger.log("debug", "Raw message details", {
            messageId: messageAdded.message.id,
            messageDetails,
            watchEmail: watch.email,
            watchId: watch.id,
          });

          // Skip if message has no content or failed to fetch
          if (!messageDetails) {
            fileLogger.log(
              "debug",
              "Skipping message - no content or failed to fetch",
              {
                messageId: messageAdded.message.id,
                watchEmail: watch.email,
                watchId: watch.id,
              }
            );
            continue;
          }

          const isExternal = this.isExternalReply(messageDetails.from, watch);

          // Log detailed processing info
          fileLogger.log("debug", "Message processing details", {
            messageId: messageDetails.id,
            threadId: messageDetails.threadId,
            from: messageDetails.from,
            isReply: messageDetails.isReply,
            isExternal,
            labelIds: messageDetails.labelIds,
            watchEmail: watch.email,
            watchAliases: watch.mailbox.aliases.map((a) => a.alias),
            skipped: !messageDetails.isReply || !isExternal,
            skipReason: !messageDetails.isReply
              ? "not a reply"
              : !isExternal
                ? "not from external sender"
                : null,
          });

          // Only process if it's a reply from someone else
          if (messageDetails.isReply && isExternal) {
            logger.info(
              {
                messageId: messageDetails.id,
                threadId: messageDetails.threadId,
                from: messageDetails.from,
                isReply: messageDetails.isReply,
              },
              "Found external reply"
            );

            changes.push({
              id: nanoid(),
              threadId: messageDetails.threadId,
              type: NotificationType.REPLY,
              messageId: messageDetails.id,
              labelIds: messageDetails.labelIds,
              from: messageDetails.from,
            });
          }
        }
      }

      // Then check labelsAdded array (existing code)
      if (record.labelsAdded) {
        for (const label of record.labelsAdded) {
          const messageDetails = await this.fetchMessageDetails(
            label.message.id,
            accessToken
          );

          // Skip if message has no content or failed to fetch
          if (!messageDetails) continue;

          changes.push({
            id: nanoid(),
            threadId: messageDetails.threadId,
            type: NotificationType.LABEL_ADDED,
            messageId: messageDetails.id,
            labelIds: label.labelIds,
            from: messageDetails.from,
          });
        }
      }
    }

    return changes;
  }

  private async updateSequenceStatuses(
    changes: HistoryChange[]
  ): Promise<void> {
    try {
      for (const change of changes) {
        // Log the change being processed
        fileLogger.log(
          "debug",
          "Processing change for sequence status update",
          {
            changeId: change.id,
            threadId: change.threadId,
            type: change.type,
            messageId: change.messageId,
          }
        );

        // Find the sequence contact for this thread
        const sequenceContact = await this.findSequenceContact(change.threadId);

        if (!sequenceContact) {
          fileLogger.log("debug", "No sequence contact found for thread", {
            threadId: change.threadId,
            messageId: change.messageId,
          });
          continue;
        }

        // Log the found sequence contact
        fileLogger.log("debug", "Found sequence contact", {
          sequenceContactId: sequenceContact.id,
          contactId: sequenceContact.contactId,
          sequenceId: sequenceContact.sequenceId,
          currentStatus: sequenceContact.status,
        });

        // Determine the new status
        const newStatus = this.determineNewStatus(change);

        if (!newStatus) {
          fileLogger.log("debug", "No status change needed", {
            threadId: change.threadId,
            currentType: change.type,
          });
          continue;
        }

        // Log the status update attempt
        fileLogger.log("info", "Updating sequence contact status", {
          sequenceContactId: sequenceContact.id,
          oldStatus: sequenceContact.status,
          newStatus: newStatus,
          threadId: change.threadId,
        });

        // Update the status
        await prisma.sequenceContact.update({
          where: { id: sequenceContact.id },
          data: {
            status: newStatus,
            completed: true,
            completedAt: new Date(),
            nextScheduledAt: null,
          },
        });

        // Log successful update
        fileLogger.log("info", "Successfully updated sequence contact status", {
          sequenceContactId: sequenceContact.id,
          newStatus,
          threadId: change.threadId,
        });
      }
    } catch (error) {
      fileLogger.log("error", "Failed to update sequence statuses", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  private async findSequenceContact(threadId: string) {
    try {
      // First find the email thread
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

      // Then find the sequence contact
      const sequenceContact = await prisma.sequenceContact.findUnique({
        where: {
          sequenceId_contactId: {
            sequenceId: emailThread.sequenceId,
            contactId: emailThread.contactId,
          },
        },
      });

      return sequenceContact;
    } catch (error) {
      fileLogger.log("error", "Error finding sequence contact", {
        threadId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return null;
    }
  }

  private determineNewStatus(
    change: HistoryChange
  ): SequenceContactStatusEnum | undefined {
    fileLogger.log("debug", "Determining new status", {
      changeType: change.type,
      messageId: change.messageId,
    });

    switch (change.type) {
      case NotificationType.REPLY:
        return SequenceContactStatusEnum.REPLIED;
      case NotificationType.BOUNCE:
        return SequenceContactStatusEnum.BOUNCED;
      default:
        return undefined;
    }
  }
}
