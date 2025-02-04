import { prisma } from "@coldjot/database";
import { nanoid } from "nanoid";
import { PUBSUB_CONFIG } from "../../config/pubsub/constants";
import {
  PubSubMessage,
  NotificationType,
  HistoryChange,
} from "../../types/pubsub";
import { verifyPubSubJwt, extractEmailFromJwt } from "../../lib/auth/pubsub";
import { logger } from "@/lib/log";
import { backOff } from "exponential-backoff";
import { SequenceContactStatusEnum } from "@coldjot/types";
import { refreshTokenIfNeeded } from "@/lib/google/gmail/helper";

interface GmailHistoryResponse {
  history: Array<{
    id: string;
    messages?: Array<{
      id: string;
      threadId: string;
      labelIds: string[];
    }>;
    messagesAdded?: Array<{
      message: {
        id: string;
        threadId: string;
        labelIds: string[];
      };
    }>;
    labelsAdded?: Array<{
      message: {
        id: string;
        threadId: string;
      };
      labelIds: string[];
    }>;
  }>;
  nextPageToken?: string;
  historyId: string;
}

export class PubSubHandler {
  async handleNotification(message: PubSubMessage): Promise<void> {
    try {
      // Decode base64 message data
      const decodedData = Buffer.from(message.data, "base64").toString();
      const notification = JSON.parse(decodedData) as {
        emailAddress: string;
        historyId: string;
      };

      // Get watch record
      const watch = await prisma.emailWatch.findFirst({
        where: {
          email: notification.emailAddress,
        },
      });

      if (!watch) {
        logger.warn(
          { emailAddress: notification.emailAddress },
          "No watch found for email address"
        );
        return;
      }

      // Store notification record
      const notificationRecord = await prisma.notificationHistory.create({
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

      // Process history changes with retry logic
      const backoffOptions = {
        numOfAttempts: PUBSUB_CONFIG.MAX_RETRIES,
        startingDelay: PUBSUB_CONFIG.BACKOFF_SECONDS * 1000,
        maxDelay: PUBSUB_CONFIG.BACKOFF_SECONDS * 5000,
        jitter: "full" as const,
      };

      await backOff(
        () => this.processHistoryChanges(watch.email, notification.historyId),
        backoffOptions
      );

      // Mark notification as processed
      await prisma.notificationHistory.update({
        where: { id: notificationRecord.id },
        data: { processed: true },
      });

      logger.info(
        { messageId: message.messageId },
        "Successfully processed notification"
      );
    } catch (error) {
      logger.error(
        { error, messageId: message.messageId },
        "Failed to process notification"
      );
      throw error; // Let PubSub retry based on subscription settings
    }
  }

  private async processHistoryChanges(
    email: string,
    historyId: string
  ): Promise<void> {
    try {
      // Get access token for the email
      const mailbox = await prisma.mailbox.findFirst({
        where: {
          email: email,
          isActive: true,
        },
      });

      if (!mailbox) {
        throw new Error(`No mailbox found for email: ${email}`);
      }

      // Refresh token if needed and get the current valid access token
      const currentAccessToken = await refreshTokenIfNeeded({
        mailboxId: mailbox.id,
        userId: mailbox.userId,
        accessToken: mailbox.access_token!,
        refreshToken: mailbox.refresh_token!,
        expiryDate: mailbox.expires_at!,
      });

      // Fetch history changes from Gmail API
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${historyId}`,
        {
          headers: {
            Authorization: `Bearer ${currentAccessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch history: ${response.statusText}`);
      }

      const data = (await response.json()) as GmailHistoryResponse;
      const changes: HistoryChange[] = [];

      // Process history records
      for (const record of data.history || []) {
        if (record.messagesAdded) {
          for (const message of record.messagesAdded) {
            changes.push({
              id: nanoid(),
              threadId: message.message.threadId,
              type: NotificationType.MESSAGE_ADDED,
              messageId: message.message.id,
              labelIds: message.message.labelIds,
            });
          }
        }

        if (record.labelsAdded) {
          for (const label of record.labelsAdded) {
            changes.push({
              id: nanoid(),
              threadId: label.message.threadId,
              type: NotificationType.LABEL_ADDED,
              messageId: label.message.id,
              labelIds: label.labelIds,
            });
          }
        }
      }

      // Update sequence statuses based on changes
      await this.updateSequenceStatus(changes);
    } catch (error) {
      logger.error(
        { error, email, historyId },
        "Failed to process history changes"
      );
      throw error;
    }
  }

  private async updateSequenceStatus(changes: HistoryChange[]): Promise<void> {
    for (const change of changes) {
      try {
        // Find sequence contact by thread ID
        const sequenceContact = await prisma.sequenceContact.findFirst({
          where: {
            threadId: change.threadId,
          },
        });

        if (!sequenceContact) continue;

        let newStatus: SequenceContactStatusEnum | undefined;

        // Determine new status based on change type and labels
        if (change.type === NotificationType.MESSAGE_ADDED) {
          newStatus = SequenceContactStatusEnum.REPLIED;
        } else if (
          change.type === NotificationType.LABEL_ADDED &&
          change.labelIds?.includes("SPAM")
        ) {
          newStatus = SequenceContactStatusEnum.BOUNCED;
        }

        if (newStatus) {
          // Update sequence contact status
          await prisma.sequenceContact.update({
            where: { id: sequenceContact.id },
            data: { status: newStatus },
          });

          logger.info(
            {
              threadId: change.threadId,
              status: newStatus,
            },
            "Updated sequence contact status"
          );
        }
      } catch (error) {
        logger.error(
          { error, threadId: change.threadId },
          "Failed to update sequence status"
        );
      }
    }
  }
}
