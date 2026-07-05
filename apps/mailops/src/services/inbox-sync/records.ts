/**
 * Record-keeping + dedupe helpers for the inbox-sync pipeline.
 *
 * Extracted from the Phase 4c.5 InboxSyncServiceImpl to keep the orchestrator
 * a flat, readable pipeline. These functions take their repositories as
 * parameters (no module-level singletons) and are pure with respect to the
 * repos — easy to unit-test in isolation (Phase 7).
 *
 * Ported verbatim from services/pubsub/helper.ts (`isHistoryIdProcessed`,
 * `isMessageProcessed`, `createProcessedMessageRecord`,
 * `createOrUpdateWatchHistory`) with the same behavior + error semantics.
 */
import { nanoid } from "nanoid";
import { NotificationType } from "@coldjot/types";
import { logger } from "@/lib/log";
import type { EmailWatchRepository } from "@/repositories/email-watch.repo";
import type { EmailWatchHistoryRepository } from "@/repositories/email-watch-history.repo";
import type { ProcessedMessageRepository } from "@/repositories/processed-message.repo";
import type { EmailThreadRepository } from "@/repositories/email-thread.repo";
import type { SequenceContactRepository } from "@/repositories/sequence-contact.repo";

// Final (terminal) SequenceContact statuses — a message arriving for a contact
// in any of these is treated as already-processed.
const FINAL_STATES = [
  "COMPLETED",
  "BOUNCED",
  "REPLIED",
  "OPTED_OUT",
  "UNSUBSCRIBED",
];

/**
 * Has this historyId already been processed for this watch, or is it older
 * than the watch's starting historyId? Returns true on error (fail-closed to
 * prevent duplicate processing — same as the original).
 */
export async function isHistoryIdProcessed(
  repos: { emailWatch: EmailWatchRepository; emailWatchHistory: EmailWatchHistoryRepository },
  watchId: string,
  historyId: string
): Promise<boolean> {
  try {
    const watch = await repos.emailWatch.findById(watchId);
    if (!watch) return true;

    const watchHistoryId = parseInt(watch.historyId);
    const notificationHistoryId = parseInt(historyId);
    if (notificationHistoryId < watchHistoryId) return true;

    const processedHistory = await repos.emailWatchHistory.findProcessed(
      watchId,
      notificationHistoryId.toString()
    );
    return !!processedHistory;
  } catch (error) {
    logger.error({ error, watchId, historyId }, "Error checking if history ID was processed");
    return true;
  }
}

/**
 * Has this message already been processed? Checks the ProcessedMessage table
 * first; if absent, checks whether the thread's SequenceContact is in a final
 * state (and records the message as processed if so). Returns false on error.
 */
export async function isMessageProcessed(
  repos: {
    processedMessage: ProcessedMessageRepository;
    emailThread: EmailThreadRepository;
    sequenceContact: SequenceContactRepository;
  },
  messageId: string,
  threadId: string
): Promise<boolean> {
  try {
    const processedMessage = await repos.processedMessage.findByMessageId(messageId);
    if (processedMessage) return true;

    const emailThread = await repos.emailThread.findSequenceContactByThread(threadId);
    if (!emailThread) return false;

    const sequenceContact = await repos.sequenceContact.findBySequenceAndContact(
      emailThread.sequenceId,
      emailThread.contactId
    );
    if (!sequenceContact) return false;

    const isProcessed = FINAL_STATES.includes(sequenceContact.status);
    if (isProcessed) {
      await repos.processedMessage.create({
        messageId,
        threadId,
        type: sequenceContact.status,
      });
    }
    return isProcessed;
  } catch (error) {
    logger.error({ error, messageId, threadId }, "Error checking if message is processed");
    return false;
  }
}

/**
 * Record a processed message. Tolerates P2002 (unique constraint) — the
 * message is already recorded. Other errors propagate.
 */
export async function createProcessedMessageRecord(
  processedMessageRepo: ProcessedMessageRepository,
  messageId: string,
  threadId: string,
  type: NotificationType
): Promise<void> {
  try {
    await processedMessageRepo.create({
      messageId,
      threadId,
      type: type.toString(),
    });
  } catch (error) {
    // P2002 (unique constraint) is benign — the message is already recorded.
    if (isPrismaUniqueConstraintError(error)) return;
    throw error;
  }
}

/**
 * Narrow an unknown caught error to a Prisma P2002 (unique-constraint) violation.
 * The fake-prisma in tests and Prisma in prod both surface `.code === "P2002"`.
 */
function isPrismaUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}

/**
 * Upsert a watch-history record for a processed notification.
 */
export async function createOrUpdateWatchHistory(
  emailWatchHistoryRepo: EmailWatchHistoryRepository,
  watchId: string,
  historyId: string,
  notificationType: NotificationType,
  data: Record<string, unknown>,
  isProcessed = false
): Promise<void> {
  await emailWatchHistoryRepo.upsert({
    id: nanoid(),
    emailWatchId: watchId,
    historyId: historyId.toString(),
    notificationType: notificationType.toString(),
    processed: isProcessed,
    data,
  });
}
