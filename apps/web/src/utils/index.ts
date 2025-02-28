import type { MessagePartHeader } from "@coldjot/types";
import crypto from "crypto";

export * from "./readability";
export * from "./spam";
// Sleep utility
export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// URL and tracking utilities
export const getBaseUrl = () => {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (url) {
    console.warn("NEXT_PUBLIC_APP_URL is not set, using fallback URL");
    if (process.env.TRACK_API_URL) {
      return process.env.TRACK_API_URL;
    }
    return process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : "https://app.zkmail.io";
  }
  return url;
};

// -----------------------------------------
// -----------------------------------------
// -----------------------------------------

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

// -----------------------------------------
// -----------------------------------------
// -----------------------------------------

// MIME and subject handling
export const encodeMIMEWords = (text: string): string => {
  if (!/^[\x00-\x7F]*$/.test(text)) {
    const encoded = Buffer.from(text, "utf-8").toString("base64");
    return `=?UTF-8?B?${encoded}?=`;
  }
  return text;
};

// -----------------------------------------
// -----------------------------------------
// -----------------------------------------

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
export const isBounceMessage = (
  headers: MessagePartHeader[],
  labelIds: string[]
) => {
  return (
    (labelIds.includes("UNDELIVERABLE") &&
      headers.some(
        (h) => h.name === "From" && h.value?.includes("mailer-daemon")
      )) ||
    headers.some((h) => h.name === "X-Failed-Recipients") ||
    headers.some(
      (h) =>
        h.name === "Content-Type" &&
        h.value?.includes("report-type=delivery-status")
    )
  );
};

// -----------------------------------------
// -----------------------------------------
// -----------------------------------------

// Helper functions for reply processing
export const shouldProcessMessage = (labelIds: string[]): boolean => {
  return !(
    labelIds.includes("SENT") ||
    labelIds.includes("DRAFT") ||
    !labelIds.includes("INBOX")
  );
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

// // Text cleaning utility
// export const cleanText = (text: string): string => {
//   return text
//     .replace(/[\n\r\t]+/g, " ") // Normalize line breaks
//     .replace(/https?:\/\/[^\s]+/g, "URL") // Replace URLs with a single word
//     .replace(/[^\w\s.!?]/g, "") // Remove special characters except punctuation
//     .replace(/\s+/g, " ") // Collapse whitespace
//     .trim();
// };
