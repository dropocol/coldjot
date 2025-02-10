import {
  NotificationType,
  PubSubMessage,
  DecodedNotification,
  MessageDetails,
} from "../../types/pubsub";
import { SequenceContactStatusEnum } from "@coldjot/types";
import { logger } from "@/lib/log";
import { prisma } from "@coldjot/database";
import { nanoid } from "nanoid";
import { Prisma } from "@prisma/client";
import {
  isBounceMessage,
  isExternalSender,
  isReplyMessage,
} from "@/utils/email";

/**
 * Sanitize sensitive data from logs
 */
export const sanitizeData = (data: any): any => {
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
  if (Array.isArray(data)) return data.map((item) => sanitizeData(item));
  if (typeof data !== "object") return data;

  const sanitized = { ...data };
  for (const key in sanitized) {
    if (sensitiveFields.includes(key)) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof sanitized[key] === "object") {
      sanitized[key] = sanitizeData(sanitized[key]);
    }
  }
  return sanitized;
};

/**
 * Decode PubSub notification data
 */
export const decodeNotification = (
  message: PubSubMessage
): DecodedNotification => {
  try {
    logger.info(message, "Decoded notification");
    const decodedData = Buffer.from(message.data, "base64").toString();
    logger.info(decodedData, "Decoded data");
    const parsedData = JSON.parse(decodedData);
    logger.info(parsedData, "Parsed data");
    logger.info(
      `Parsed historyId: ${parsedData.historyId} && type: ${typeof parsedData.historyId}`
    );

    if (!isValidNotification(parsedData)) {
      throw new Error("Invalid notification format: missing required fields");
    }

    return parsedData;
  } catch (error) {
    logger.error({ error }, "Failed to decode notification data");
    throw new Error("Invalid notification format");
  }
};

/**
 * Validate notification data structure
 */
export const isValidNotification = (data: any): data is DecodedNotification => {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof data.emailAddress === "string" &&
    (typeof data.historyId === "number" || typeof data.historyId === "string")
  );
};

/**
 * Calculate history gap between current and notification history IDs
 */
export const calculateHistoryGap = (
  currentHistoryId: string,
  notificationHistoryId: string
): { gap: number; startHistoryId: string } => {
  const current = BigInt(currentHistoryId);
  const notification = BigInt(notificationHistoryId);
  const gap = Number(notification - current);

  return {
    gap,
    startHistoryId: gap < 0 ? notificationHistoryId : currentHistoryId,
  };
};

/**
 * Check if history gap is too large
 */
export const isLargeHistoryGap = (gap: number): boolean => {
  return Math.abs(gap) > 10000;
};

/**
 * Determine new sequence contact status based on change type
 */
export const determineNewStatus = (
  changeType: NotificationType
): SequenceContactStatusEnum | null => {
  switch (changeType) {
    case NotificationType.REPLY:
      return SequenceContactStatusEnum.REPLIED;
    case NotificationType.BOUNCE:
      return SequenceContactStatusEnum.BOUNCED;
    default:
      return null;
  }
};

/**
 * Format error for logging
 */
export const formatError = (
  error: unknown
): { message: string; stack?: string } => {
  return {
    message: error instanceof Error ? error.message : "Unknown error",
    stack: error instanceof Error ? error.stack : undefined,
  };
};

/**
 * Check if a history ID has already been processed for a mailbox
 * or if it's older than our watch setup
 */
export const isHistoryIdProcessed = async (
  watchId: string,
  historyId: string
): Promise<boolean> => {
  try {
    // First get the watch record to check its initial historyId
    const watch = await prisma.emailWatch.findUnique({
      where: { id: watchId },
    });

    if (!watch) {
      logger.warn({ watchId }, "Watch not found when checking history ID");
      return true; // Treat as processed if watch doesn't exist
    }

    // Convert history IDs to numbers for comparison
    const watchHistoryId = parseInt(watch.historyId);
    const notificationHistoryId = parseInt(historyId);

    // If the notification history ID is older than our watch setup,
    // we should skip it to avoid processing old events
    if (notificationHistoryId < watchHistoryId) {
      logger.info(
        {
          watchId,
          watchHistoryId,
          notificationHistoryId,
        },
        "Skipping old history ID from before watch setup"
      );
      return true;
    }

    // Then check if we've already processed this history ID
    const processedHistory = await prisma.emailWatchHistory.findFirst({
      where: {
        emailWatchId: watchId,
        historyId: notificationHistoryId.toString(),
        processed: true,
      },
    });

    return !!processedHistory;
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        watchId,
        historyId,
      },
      "Error checking if history ID was processed"
    );
    return true; // Treat as processed on error to prevent duplicate processing
  }
};

/**
 * Check if a message has already been processed for a sequence
 */
export const isMessageProcessed = async (
  messageId: string,
  threadId: string
): Promise<boolean> => {
  try {
    // First check if we have already processed this message using the dedicated table
    const processedMessage = await prisma.processedMessage.findUnique({
      where: { messageId },
    });

    if (processedMessage) {
      logger.debug(
        { messageId, threadId, type: processedMessage.type },
        "Message already processed"
      );
      return true;
    }

    // Then check if the thread exists and get its sequence contact
    const emailThread = await prisma.emailThread.findUnique({
      where: { threadId },
      select: {
        sequenceId: true,
        contactId: true,
      },
    });

    if (!emailThread) {
      return false;
    }

    // Get the sequence contact status with minimal fields
    const sequenceContact = await prisma.sequenceContact.findUnique({
      where: {
        sequenceId_contactId: {
          sequenceId: emailThread.sequenceId,
          contactId: emailThread.contactId,
        },
      },
      select: {
        status: true,
      },
    });

    if (!sequenceContact) {
      return false;
    }

    // Check if the sequence contact is in a final state
    const finalStates = [
      "COMPLETED",
      "BOUNCED",
      "REPLIED",
      "OPTED_OUT",
      "UNSUBSCRIBED",
    ];

    const isProcessed = finalStates.includes(sequenceContact.status);

    // If the contact is in a final state, record this message as processed
    if (isProcessed) {
      await prisma.processedMessage.create({
        data: {
          messageId,
          threadId,
          type: sequenceContact.status,
        },
      });
    }

    return isProcessed;
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        messageId,
        threadId,
      },
      "Error checking if message is processed"
    );
    return false;
  }
};

/**
 * Check if a sequence contact can be updated
 */
export const canUpdateSequenceContact = async (
  sequenceId: string,
  contactId: string,
  newStatus: string
): Promise<boolean> => {
  const sequenceContact = await prisma.sequenceContact.findUnique({
    where: {
      sequenceId_contactId: {
        sequenceId,
        contactId,
      },
    },
  });

  if (!sequenceContact) {
    return false;
  }

  // Don't update if sequence is disabled
  const sequence = await prisma.sequence.findUnique({
    where: { id: sequenceId },
  });

  if (!sequence || sequence.disableSending) {
    return false;
  }

  // Don't update if already in a final state
  const finalStates = [
    "COMPLETED",
    "BOUNCED",
    "REPLIED",
    "OPTED_OUT",
    "UNSUBSCRIBED",
  ];

  if (finalStates.includes(sequenceContact.status)) {
    return false;
  }

  // Allow update if current status is different from new status
  return sequenceContact.status !== newStatus;
};

/**
 * Create a processed message record
 */
export const createProcessedMessageRecord = async (
  messageId: string,
  threadId: string,
  type: NotificationType
): Promise<void> => {
  try {
    await prisma.processedMessage.create({
      data: {
        messageId,
        threadId,
        type: type.toString(),
      },
    });

    logger.debug(
      { messageId, threadId, type },
      "Successfully created processed message record"
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // P2002 is the error code for unique constraint violation
      if (error.code === "P2002") {
        logger.debug(
          { messageId, threadId, type },
          "Processed message record already exists"
        );
        return;
      }
    }
    logger.error(
      { error, messageId, threadId, type },
      "Failed to create processed message record"
    );
    throw error;
  }
};

/**
 * Determine notification type from message details
 */
export const determineNotificationType = async (
  details: MessageDetails,
  userEmails: string[],
  threadId: string
): Promise<NotificationType> => {
  // Check for bounce first as it's highest priority
  if (isBounceMessage(details.headers)) {
    return NotificationType.BOUNCE;
  }

  // Then check for replies from external senders
  const isExternal = isExternalSender(details.from, userEmails);
  if (isExternal && isReplyMessage(details.headers)) {
    return NotificationType.REPLY;
  }

  // Check if this is the first message in the thread
  const isFirstMessage = await isOriginalMessage(threadId, details.messageId);
  if (isFirstMessage) {
    return NotificationType.ORIGINAL_MESSAGE;
  }

  // If none of the above conditions match, it's a regular message
  return NotificationType.MESSAGE_ADDED;
};

/**
 * Check if a message is the original message in a thread
 */
export const isOriginalMessage = async (
  threadId: string,
  messageId: string
): Promise<boolean> => {
  const messages = await prisma.processedMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    take: 1,
  });

  return messages.length === 0;
};

/**
 * Create or update email watch history record
 */
export const createOrUpdateWatchHistory = async (
  watchId: string,
  historyId: string,
  notificationType: NotificationType,
  data: any,
  isProcessed: boolean = false
): Promise<void> => {
  try {
    const id = nanoid();
    await prisma.emailWatchHistory.upsert({
      where: {
        id,
      },
      create: {
        id,
        emailWatchId: watchId,
        historyId: historyId.toString(),
        notificationType: notificationType.toString(),
        processed: isProcessed,
        data,
      },
      update: {
        notificationType: notificationType.toString(),
        processed: isProcessed,
        data,
      },
    });

    logger.debug(
      { watchId, historyId, notificationType, isProcessed },
      "Successfully created/updated watch history record"
    );
  } catch (error) {
    logger.error(
      { error, watchId, historyId, notificationType },
      "Failed to create/update watch history record"
    );
    throw error;
  }
};

/**
 * Create initial watch history record
 */
export const createInitialWatchHistory = async (
  watchId: string,
  historyId: string,
  emailAddress: string
): Promise<any> => {
  return prisma.emailWatchHistory.create({
    data: {
      id: nanoid(),
      emailWatchId: watchId,
      historyId: historyId.toString(),
      notificationType: NotificationType.PROCESSING,
      processed: false,
      data: {
        historyId,
        emailAddress,
      },
    },
  });
};
