/**
 * Pure PubSub notification decode + log-sanitization helpers.
 *
 * Extracted from the Phase 4c.5 InboxSyncServiceImpl to keep the orchestrator
 * focused on the sync pipeline. Ported verbatim from services/pubsub/helper.ts
 * (`decodeNotification`, `isValidNotification`, `sanitizeData`) — no behavior
 * change.
 */
import type { PubSubMessage, DecodedNotification } from "@coldjot/types";
import { logger } from "@/lib/log";

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
export function sanitizeData(data: any): any {
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

export function isValidNotification(data: any): data is DecodedNotification {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof data.emailAddress === "string" &&
    (typeof data.historyId === "number" || typeof data.historyId === "string")
  );
}

/**
 * Decode + validate the base64-encoded PubSub message payload. Throws
 * "Invalid notification format" on any failure (same as the original).
 */
export function decodeNotification(message: PubSubMessage): DecodedNotification {
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
