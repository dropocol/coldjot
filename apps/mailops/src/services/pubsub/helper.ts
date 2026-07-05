import {
  NotificationType,
  PubSubMessage,
  DecodedNotification,
  MessageDetails,
} from "@coldjot/types";
import { logger } from "@/lib/log";
import { nanoid } from "nanoid";
import { Prisma } from "@prisma/client";
import { PrismaEmailThreadRepository } from "@/repositories/prisma/prisma-email-thread.repo";
import { PrismaEmailWatchRepository } from "@/repositories/prisma/prisma-email-watch.repo";
import { PrismaEmailWatchHistoryRepository } from "@/repositories/prisma/prisma-email-watch-history.repo";
import { PrismaProcessedMessageRepository } from "@/repositories/prisma/prisma-processed-message.repo";
import { PrismaSequenceContactRepository } from "@/repositories/prisma/prisma-sequence-contact.repo";
import { PrismaSequenceRepository } from "@/repositories/prisma/prisma-sequence.repo";

// Phase 4c.2: classification + history-gap math moved to classify.ts. Re-export
// so existing handler.ts imports (`calculateHistoryGap`, `isLargeHistoryGap`,
// `determineNotificationType`) keep resolving until 4c.5/4c.6 deletes the
// handler.
export {
  calculateHistoryGap,
  isLargeHistoryGap,
} from "@/services/inbox-sync/classify";

// Module-level repo singletons for the standalone helper fns (matches the
// lib/tracking stopgap pattern).
const emailThreadRepo = new PrismaEmailThreadRepository();
const emailWatchRepo = new PrismaEmailWatchRepository();
const emailWatchHistoryRepo = new PrismaEmailWatchHistoryRepository();
const processedMessageRepo = new PrismaProcessedMessageRepository();
const sequenceContactRepo = new PrismaSequenceContactRepository();
const sequenceRepo = new PrismaSequenceRepository();

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
    logger.info({ message }, "Decoded notification");
    const decodedData = Buffer.from(message.data, "base64").toString();
    logger.info({ data: decodedData }, "Decoded data");
    const parsedData = JSON.parse(decodedData);
    logger.info({ data: parsedData }, "Parsed data");
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
 * Determine new sequence contact status based on change type.
 *
 * Phase 4c.3: moved to services/inbox-sync/states.ts (`nextContactStatus`).
 * Re-exported here under the legacy name so the still-live PubSubHandler
 * (`updateSequenceStatuses`) keeps resolving until 4c.5.
 */
export { nextContactStatus as determineNewStatus } from "@/services/inbox-sync/states";

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
    const watch = await emailWatchRepo.findById(watchId);

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
    const processedHistory = await emailWatchHistoryRepo.findProcessed(
      watchId,
      notificationHistoryId.toString()
    );

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
    const processedMessage = await processedMessageRepo.findByMessageId(messageId);

    if (processedMessage) {
      logger.debug(
        { messageId, threadId, type: processedMessage.type },
        "Message already processed"
      );
      return true;
    }

    // Then check if the thread exists and get its sequence contact
    const emailThread = await emailThreadRepo.findSequenceContactByThread(threadId);

    if (!emailThread) {
      return false;
    }

    // Get the sequence contact status with minimal fields
    const sequenceContact = await sequenceContactRepo.findBySequenceAndContact(
      emailThread.sequenceId,
      emailThread.contactId
    );

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
      await processedMessageRepo.create({
        messageId,
        threadId,
        type: sequenceContact.status,
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
  const sequenceContact = await sequenceContactRepo.findBySequenceAndContact(
    sequenceId,
    contactId
  );

  if (!sequenceContact) {
    return false;
  }

  // Don't update if sequence is disabled
  const sequence = await sequenceRepo.findWithDetails(sequenceId);

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
    await processedMessageRepo.create({
      messageId,
      threadId,
      type: type.toString(),
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
 * Determine notification type from message details.
 *
 * Phase 4c.2: the canonical classifier lives in classify.ts and takes the
 * `hasOriginalForThread` lookup as an injected arg (keeping that module pure).
 * This wrapper preserves the original 3-arg signature so the still-live
 * PubSubHandler call site keeps working until 4c.5 writes the new orchestrator.
 */
export const determineNotificationType = async (
  details: MessageDetails,
  userEmails: string[],
  threadId: string
): Promise<NotificationType> => {
  const { determineNotificationType: classify } = await import(
    "@/services/inbox-sync/classify"
  );
  return classify(details, userEmails, threadId, (tid) =>
    processedMessageRepo.hasOriginalForThread(tid)
  );
};

/**
 * Check if a message is the original message in a thread
 */
export const isOriginalMessage = async (
  threadId: string,
  messageId: string
): Promise<boolean> => {
  const hasOriginal = await processedMessageRepo.hasOriginalForThread(threadId);

  return !hasOriginal;
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
    await emailWatchHistoryRepo.upsert({
      id,
      emailWatchId: watchId,
      historyId: historyId.toString(),
      notificationType: notificationType.toString(),
      processed: isProcessed,
      data,
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
  return emailWatchHistoryRepo.create({
    id: nanoid(),
    emailWatchId: watchId,
    historyId: historyId.toString(),
    notificationType: NotificationType.PROCESSING,
    processed: false,
    data: {
      historyId,
      emailAddress,
    },
  });
};
