/**
 * Pure classification primitives for inbox sync.
 *
 * Extracted from utils/email.ts + services/pubsub/helper.ts in Phase 4c.2
 * (move-only). Everything here is a pure predicate or pure function — no DB,
 * no fetch, no I/O. `utils/email.ts` re-exports the predicate functions so
 * existing importers (thread-watch processor, GmailInboxSource) keep
 * resolving; the canonical home is now this file.
 *
 * These are unit-testable in isolation (coverage lands in Phase 7).
 */
import type {
  MessagePartHeader,
  MessageDetails,
  NotificationType,
} from "@coldjot/types";
import { NotificationType as NotificationTypeEnum, EmailLabelEnum } from "@coldjot/types";

// ---------------------------------------------------------------------------
// Message-shape predicates (moved verbatim from utils/email.ts)
// ---------------------------------------------------------------------------

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

export const isReplyMessage = (headers: MessagePartHeader[]): boolean => {
  return headers.some(
    (h: MessagePartHeader) =>
      (h.name === "In-Reply-To" && h.value) ||
      (h.name === "References" && h.value) ||
      (h.name === "Subject" && h.value?.toLowerCase().startsWith("re:"))
  );
};

// ---------------------------------------------------------------------------
// Notification classification (moved verbatim from services/pubsub/helper.ts)
// ---------------------------------------------------------------------------

/**
 * Determine the notification type from message details.
 *
 * The `hasOriginalForThread` predicate is injected so this module stays free
 * of repository imports (pure). The original implementation read
 * `processedMessageRepo.hasOriginalForThread` directly; the caller passes that
 * same lookup. Priority order is preserved exactly: bounce → external reply →
 * original-message → MESSAGE_ADDED.
 */
export const determineNotificationType = async (
  details: MessageDetails,
  userEmails: string[],
  threadId: string,
  hasOriginalForThread: (threadId: string) => Promise<boolean>
): Promise<NotificationType> => {
  // Check for bounce first as it's highest priority
  if (isBounceMessage(details.headers)) {
    return NotificationTypeEnum.BOUNCE;
  }

  // Then check for replies from external senders
  const isExternal = isExternalSender(details.from, userEmails);
  if (isExternal && isReplyMessage(details.headers)) {
    return NotificationTypeEnum.REPLY;
  }

  // Check if this is the first message in the thread
  const isFirstMessage = !(await hasOriginalForThread(threadId));
  if (isFirstMessage) {
    return NotificationTypeEnum.ORIGINAL_MESSAGE;
  }

  // If none of the above conditions match, it's a regular message
  return NotificationTypeEnum.MESSAGE_ADDED;
};

// ---------------------------------------------------------------------------
// History-gap math (moved verbatim from services/pubsub/helper.ts)
// ---------------------------------------------------------------------------

/**
 * Calculate history gap between current and notification history IDs.
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
 * Check if history gap is too large.
 */
export const isLargeHistoryGap = (gap: number): boolean => {
  return Math.abs(gap) > 10000;
};
