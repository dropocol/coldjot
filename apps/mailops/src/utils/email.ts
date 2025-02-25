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
  // Common bounce sender patterns
  const bounceSenders = [
    "mailer-daemon@googlemail.com",
    "postmaster@",
    "mailerdaemon@",
    "mailer-daemon@",
    "mail delivery subsystem",
    "mail delivery system",
    "automated-message@",
    "system-messages@",
    "noreply@",
    "no-reply@",
    "auto-reply@",
    "autoreply@",
  ];

  // Common bounce subject patterns
  const bounceSubjects = [
    "delivery status notification",
    "mail delivery failed",
    "failure notice",
    "returned mail",
    "undeliverable",
    "delivery failed",
    "failure delivery",
    "non-delivery report",
    "delivery problem",
    "delivery notification",
    "message delivery failed",
    "delivery status report",
    "mail system error",
    "delayed delivery notification",
    "permanent delivery failure",
    "temporary delivery failure",
    "message blocked",
    "message not delivered",
    "auto-reply",
    "out of office",
    "automatic reply",
  ];

  // Extract headers for analysis
  const fromHeader =
    headers
      .find((h) => h.name?.toLowerCase() === "from")
      ?.value?.toLowerCase() || "";
  const subjectHeader =
    headers
      .find((h) => h.name?.toLowerCase() === "subject")
      ?.value?.toLowerCase() || "";
  const contentTypeHeader =
    headers
      .find((h) => h.name?.toLowerCase() === "content-type")
      ?.value?.toLowerCase() || "";
  const failedRecipientsHeader = headers.find(
    (h) => h.name?.toLowerCase() === "x-failed-recipients"
  )?.value;
  const autoSubmittedHeader =
    headers
      .find((h) => h.name?.toLowerCase() === "auto-submitted")
      ?.value?.toLowerCase() || "";
  const returnPathHeader =
    headers
      .find((h) => h.name?.toLowerCase() === "return-path")
      ?.value?.toLowerCase() || "";
  const feedbackTypeHeader =
    headers
      .find((h) => h.name?.toLowerCase() === "x-feedback-id")
      ?.value?.toLowerCase() || "";

  // Check conditions
  const isFromBounceSender = bounceSenders.some((sender) =>
    fromHeader.includes(sender)
  );
  const hasBouncySubject = bounceSubjects.some((subject) =>
    subjectHeader.includes(subject)
  );
  const hasFailedRecipients = !!failedRecipientsHeader;
  const isDeliveryStatusReport =
    contentTypeHeader.includes("report-type=delivery-status") ||
    contentTypeHeader.includes("delivery-status") ||
    contentTypeHeader.includes("multipart/report");
  const isAutoSubmitted =
    autoSubmittedHeader.includes("auto-generated") ||
    autoSubmittedHeader.includes("auto-replied") ||
    autoSubmittedHeader.includes("auto-notified");
  const isEmptyReturnPath =
    returnPathHeader === "<>" || returnPathHeader.includes("mailer-daemon");
  const isFeedbackReport =
    feedbackTypeHeader.includes("abuse") ||
    feedbackTypeHeader.includes("bounce");

  // Additional checks for specific mail server responses
  const hasMailerHeaders = headers.some(
    (h) =>
      h.name?.toLowerCase().startsWith("x-failed") ||
      h.name?.toLowerCase().startsWith("x-bounce") ||
      h.name?.toLowerCase().includes("delivery-notification")
  );

  // Return true if any bounce condition is met
  return (
    isFromBounceSender ||
    hasBouncySubject ||
    hasFailedRecipients ||
    isDeliveryStatusReport ||
    isAutoSubmitted ||
    isEmptyReturnPath ||
    isFeedbackReport ||
    hasMailerHeaders
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

/**
 * Check if an email message has content by analyzing its headers
 */
export const hasMessageContent = (headers: MessagePartHeader[]): boolean => {
  // Check Content-Type header
  const contentType =
    headers.find((h) => h.name?.toLowerCase() === "content-type")?.value || "";

  // Check if it's a multipart message
  const isMultipart = contentType.toLowerCase().includes("multipart");

  // Check if it has a text or html content type
  const hasTextContent =
    contentType.toLowerCase().includes("text/plain") ||
    contentType.toLowerCase().includes("text/html");

  // Check Content-Length header if present
  const contentLength = parseInt(
    headers.find((h) => h.name?.toLowerCase() === "content-length")?.value ||
      "0"
  );

  // Consider the message has content if:
  // 1. It's a multipart message (likely has attachments or multiple parts)
  // 2. It has text content
  // 3. It has a positive content length
  return isMultipart || hasTextContent || contentLength > 0;
};

// -----------------------------------------
// -----------------------------------------
// -----------------------------------------

/**
 * Check if an email is from an external sender by comparing against a list of internal emails
 */
export const isExternalSender = (
  fromHeader: string,
  internalEmails: string[]
): boolean => {
  // Extract email from the from header
  const senderEmail =
    (fromHeader.match(/<(.+?)>/) ||
      fromHeader.match(/([^<\s]+@[^>\s]+)/) ||
      [])[1] || fromHeader;
  const normalizedSender = senderEmail.toLowerCase().trim();
  const normalizedInternalEmails = internalEmails.map((email) =>
    email.toLowerCase().trim()
  );

  return !normalizedInternalEmails.includes(normalizedSender);
};

// -----------------------------------------
// -----------------------------------------
// -----------------------------------------

/**
 * Check if a message is a reply by analyzing its headers
 */
export const isReplyMessage = (headers: MessagePartHeader[]): boolean => {
  return headers.some(
    (h: MessagePartHeader) =>
      (h.name === "In-Reply-To" && h.value) ||
      (h.name === "References" && h.value) ||
      (h.name === "Subject" && h.value?.toLowerCase().startsWith("re:"))
  );
};

// -----------------------------------------
// -----------------------------------------
// -----------------------------------------
