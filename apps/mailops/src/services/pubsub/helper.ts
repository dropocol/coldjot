import {
  NotificationType,
  PubSubMessage,
  DecodedNotification,
} from "../../types/pubsub";
import { SequenceContactStatusEnum } from "@coldjot/types";
import { logger } from "@/lib/log";

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
