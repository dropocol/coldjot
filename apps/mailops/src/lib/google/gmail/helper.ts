import { generateMessageId } from "@/utils";
import { logger } from "@/lib/log";
import { refreshAccessToken } from "@/lib/google";
import {
  MailboxCredentials,
  GmailMessage,
  MessageHeader,
  ThreadHeaders,
} from "@coldjot/types";


/**
 * Check if the access token needs to be refreshed
 * Refreshes token if it's about to expire within 5 minutes
 */
export function shouldRefreshToken(credentials: MailboxCredentials): boolean {
  // If expiryDate exists and is within 5 minutes of expiring
  // const needsRefresh =
  // credentials.expiryDate &&
  // credentials.expiryDate < Date.now() + 5 * 60 * 1000; // 5 minutes buffer

  // Convert expiryDate to Date object and get local time
  const expiryDate = credentials.expiryDate
    ? credentials.expiryDate * 1000
    : new Date().getDate();

  const now = new Date().getTime() + 5 * 60 * 1000;
  const needsRefresh = expiryDate && expiryDate < now;

  if (needsRefresh) {
    logger.info("🔄 Token expired or about to expire, refreshing...");
  }

  return needsRefresh ? needsRefresh : false;
}


/**
 * Refresh the access token if needed
 * Returns the current valid access token (either refreshed or existing)
 */
export async function refreshTokenIfNeeded(
  credentials: MailboxCredentials
): Promise<string> {
  try {
    if (shouldRefreshToken(credentials)) {
      logger.info(
        { userId: credentials.userId },
        "🔄 Attempting to refresh access token"
      );

      // Check the refresh token where it's stored
      const newAccessToken = await refreshAccessToken(
        credentials.userId,
        credentials.mailboxId,
        credentials.refreshToken
      );

      if (!newAccessToken) {
        throw new Error("Failed to refresh access token");
      }

      logger.info(
        { userId: credentials.userId },
        "✅ Access token refreshed successfully"
      );

      return newAccessToken;
    }

    return credentials.accessToken;
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        userId: credentials.userId,
      },
      "❌ Failed to refresh access token"
    );
    throw error;
  }
}


/**
 * Validate required Gmail credentials
 * Throws an error if required credentials are missing
 */
export function validateGmailCredentials(
  credentials: MailboxCredentials
): void {
  logger.info("🔄 Validating Gmail credentials");

  // TODO : check the code and remove if necessary
  const isTokenExpired =
    !credentials.expiryDate || new Date(credentials.expiryDate) <= new Date();
  if (!credentials.accessToken || !credentials.refreshToken) {
    logger.error(
      {
        userId: credentials.userId,
        hasAccessToken: !!credentials.accessToken,
        hasRefreshToken: !!credentials.refreshToken,
      },
      "❌ Missing required tokens"
    );
    throw new Error("Missing required tokens");
  }
}


/**
 * Set OAuth2 credentials with the provided access token and options
 */
export function setOAuth2Credentials(
  auth: any,
  accessToken: string,
  credentials: MailboxCredentials
): void {
  auth.setCredentials({
    access_token: accessToken,
    refresh_token: credentials.refreshToken,
    token_type: credentials.tokenType || "Bearer",
    expiry_date: credentials.expiryDate,
  });
}


export async function getEmailThreadInfo(
  gmail: any,
  threadId: string | undefined
): Promise<{
  threadHeaders: ThreadHeaders;
  originalSubject?: string;
}> {
  let threadHeaders: ThreadHeaders = {
    messageId: generateMessageId().replace(/@[^>]+>$/, "@mail.gmail.com>"),
  };
  let originalSubject: string | undefined;

  if (!threadId) {
    return { threadHeaders };
  }

  try {
    const thread = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "metadata",
      metadataHeaders: ["Message-ID", "References", "In-Reply-To", "Subject"],
    });

    if (thread.data.messages && thread.data.messages.length > 0) {
      const messages = thread.data.messages as GmailMessage[];
      const firstMessage = messages[0];
      const firstMessageHeaders = firstMessage.payload?.headers || [];
      const rawOriginalSubject = firstMessageHeaders.find(
        (h: MessageHeader) => h.name?.toLowerCase() === "subject"
      )?.value;

      if (rawOriginalSubject) {
        originalSubject = rawOriginalSubject.replace(
          /=\?UTF-8\?B\?(.*?)\?=/g,
          (_match: string, p1: string) =>
            Buffer.from(p1, "base64").toString("utf8")
        );
      }

      // Get the last message we're replying to
      const lastMessage = messages[messages.length - 1];
      const lastMessageHeaders = lastMessage.payload?.headers || [];

      // Get the Message-ID of the last message to use as In-Reply-To
      const lastMessageId = lastMessageHeaders.find(
        (h: MessageHeader) => h.name?.toLowerCase() === "message-id"
      )?.value;

      // Build References chain by collecting all Message-IDs in order
      const references = messages
        .map((msg: GmailMessage) => {
          const msgIdHeader = msg.payload?.headers?.find(
            (h: MessageHeader) => h.name?.toLowerCase() === "message-id"
          );
          return msgIdHeader?.value;
        })
        .filter(Boolean) as string[];

      // Get existing References from the last message
      const existingReferences = lastMessageHeaders
        .find((h: MessageHeader) => h.name?.toLowerCase() === "references")
        ?.value?.split(/\s+/)
        .filter(Boolean);

      // Combine existing references with new ones, maintaining order and removing duplicates
      const allReferences = [
        ...new Set([...(existingReferences || []), ...references]),
      ];

      // Ensure all Message-IDs have proper Gmail format
      const formattedReferences = allReferences.map((ref) =>
        ref.includes("@mail.gmail.com")
          ? ref
          : ref.replace(/@[^>]+>$/, "@mail.gmail.com>")
      );

      threadHeaders = {
        messageId: generateMessageId().replace(/@[^>]+>$/, "@mail.gmail.com>"),
        inReplyTo: lastMessageId,
        references: formattedReferences,
      };
    }
  } catch (error) {
    logger.error({ err: error }, "Error getting thread details");
  }

  return { threadHeaders, originalSubject };
}
