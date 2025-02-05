import type { MessagePartHeader } from "@coldjot/types";
import crypto from "crypto";
import { EmailLabelEnum } from "@coldjot/types";
// Message ID generation
export const generateMessageId = (): string => {
  const domain = process.env.EMAIL_DOMAIN || "gmail.com";
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).substring(2);
  return `<${timestamp}.${randomPart}@${domain}>`;
};

export const normalizeMessageId = (messageId: string): string => {
  if (!messageId) return "";
  return messageId.includes("@") ? messageId : `<${messageId}@gmail.com>`;
};

// MIME and subject handling
export const encodeMIMEWords = (text: string): string => {
  if (!/^[\x00-\x7F]*$/.test(text)) {
    const encoded = Buffer.from(text, "utf-8").toString("base64");
    return `=?UTF-8?B?${encoded}?=`;
  }
  return text;
};

export const normalizeSubject = (
  subject: string,
  isReply: boolean,
  originalSubject?: string
): string => {
  const baseSubject = isReply && originalSubject ? originalSubject : subject;
  const cleanSubject = baseSubject.replace(/^(Re:\s*)+/i, "").trim();
  const finalSubject = isReply ? `Re: ${cleanSubject}` : cleanSubject;
  return encodeMIMEWords(finalSubject);
};

// -----------------------------------------
// -----------------------------------------
// -----------------------------------------

// Helper Functions
export const extractEmailFromHeader = (fromHeader: string): string => {
  return fromHeader.match(/<(.+?)>|(.+)/)?.[1] || fromHeader;
};

// -----------------------------------------
// -----------------------------------------
// -----------------------------------------

export const isSenderSequenceOwner = (
  senderEmail: string,
  userId: string
): boolean => {
  return senderEmail.toLowerCase() === userId.toLowerCase();
};

// -----------------------------------------
// -----------------------------------------
// -----------------------------------------

// Helper functions for bounce processing
export const isBounceMessage = (headers: MessagePartHeader[]) => {
  const bounceIndicators = [
    "mailer-daemon",
    "mail delivery subsystem",
    "mail delivery failed",
    "delivery status notification",
    "undeliverable",
    "failed delivery",
    "delivery failure",
    "non-delivery report",
    "returned mail",
    "delivery problem",
    "failure notice",
    "delivery notification",
  ];

  const bounceSenders = [
    "mailer-daemon@googlemail.com",
    "postmaster@",
    "mailerdaemon@",
    "mailer-daemon@",
  ];

  return (
    // Check From header for mailer-daemon and known bounce senders
    headers.some(
      (h) =>
        h.name?.toLowerCase() === "from" &&
        (bounceIndicators.some((indicator) =>
          h.value?.toLowerCase().includes(indicator)
        ) ||
          bounceSenders.some((sender) =>
            h.value?.toLowerCase().includes(sender)
          ))
    ) ||
    // Check for failed recipients
    headers.some(
      (h) => h.name?.toLowerCase() === "x-failed-recipients" && h.value
    ) ||
    // Check Content-Type for delivery status
    headers.some(
      (h) =>
        h.name?.toLowerCase() === "content-type" &&
        (h.value?.toLowerCase().includes("report-type=delivery-status") ||
          h.value?.toLowerCase().includes("delivery-status") ||
          h.value?.toLowerCase().includes("multipart/report"))
    ) ||
    // Check Subject for bounce indicators
    headers.some(
      (h) =>
        h.name?.toLowerCase() === "subject" &&
        bounceIndicators.some((indicator) =>
          h.value?.toLowerCase().includes(indicator)
        )
    )
  );
};

// -----------------------------------------
// -----------------------------------------
// -----------------------------------------

// Helper functions for reply processing
export const shouldProcessMessage = (labelIds: string[]): boolean => {
  const normalizedLabels = labelIds.map((label) => label.toUpperCase());

  // Don't process if it's in SENT or DRAFT
  if (
    normalizedLabels.includes(EmailLabelEnum.SENT) ||
    normalizedLabels.includes(EmailLabelEnum.DRAFT)
  ) {
    return false;
  }

  // Must be in INBOX or have INBOX/CATEGORY_* label
  const isInInbox = normalizedLabels.some(
    (label) =>
      label === EmailLabelEnum.INBOX ||
      label.startsWith("CATEGORY_") ||
      label === EmailLabelEnum.IMPORTANT
  );

  // Must not be spam or trash
  const isNotSpamOrTrash = !normalizedLabels.some(
    (label) =>
      label === EmailLabelEnum.SPAM ||
      label === EmailLabelEnum.TRASH ||
      label === EmailLabelEnum.JUNK
  );

  return isInInbox && isNotSpamOrTrash;
};

// -----------------------------------------
// -----------------------------------------
// -----------------------------------------

export const extractPossibleMessageIds = (
  headers: MessagePartHeader[]
): string[] => {
  const inReplyTo = headers
    .find((h) => h.name === "In-Reply-To")
    ?.value?.replace(/[<>]/g, "");
  const references = headers
    .find((h) => h.name === "References")
    ?.value?.split(/\s+/)
    .map((ref) => ref.replace(/[<>]/g, ""));

  return [inReplyTo, ...(references || [])].filter(
    (id): id is string => typeof id === "string" && id.length > 0
  );
};

// -----------------------------------------
// -----------------------------------------
// -----------------------------------------

// Helper functions for POST handler
// TODO : FIX IT
export const validateAuthorization = async (req: {
  headers: { get: (name: string) => string | null };
}): Promise<string | null> => {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }
  return authorization.replace("Bearer ", "");
};

// -----------------------------------------
// -----------------------------------------
// -----------------------------------------

/**
 * Generate a unique MIME boundary
 */
export function generateMimeBoundary(): string {
  return `m${Math.random().toString(36).substring(2)}${Date.now().toString(36)}`;
}

// -----------------------------------------
// -----------------------------------------
// -----------------------------------------

/**
 * Convert HTML content to plain text
 */
export function convertToPlainText(content: string): string {
  return content
    .replace(/<[^>]+>/g, "") // Remove HTML tags
    .replace(/&nbsp;/g, " ") // Replace &nbsp; with space
    .trim();
}

// -----------------------------------------
// -----------------------------------------
// -----------------------------------------

/**
 * Format sender information
 */
export function formatSenderInfo(email: string, name?: string): string {
  return name ? `${name} <${email}>` : email;
}

// -----------------------------------------
// -----------------------------------------
// -----------------------------------------

/**
 * Generate a debeaconized ID
 */
export function generateDebeaconizedId(): string {
  return crypto.randomBytes(8).toString("hex");
}

// -----------------------------------------
// -----------------------------------------
// -----------------------------------------

/**
 * Convert email content to base64url format
 */
export function convertEmailToBase64Format(content: string): string {
  return Buffer.from(content)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// -----------------------------------------
// -----------------------------------------
// -----------------------------------------

/**
 * Parse MIME boundary from headers
 */
export function parseMimeBoundary(headers: string): string {
  const boundaryMatch = headers.match(/boundary="([^"]+)"/);
  if (!boundaryMatch) {
    throw new Error("Could not find boundary in email headers");
  }
  return boundaryMatch[1];
}

// -----------------------------------------
// -----------------------------------------
// -----------------------------------------

/**
 * Split email into headers and body parts
 */
export function splitEmailContent(emailContent: string): {
  headers: string;
  body: string;
} {
  const [headers, ...bodyParts] = emailContent.split("\r\n\r\n");
  return {
    headers,
    body: bodyParts.join("\r\n\r\n"),
  };
}

// -----------------------------------------
// -----------------------------------------
// -----------------------------------------
