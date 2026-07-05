/**
 * Apply a classification: write the EmailEvent + update the SequenceContact to
 * its terminal status + bump sequence stats.
 *
 * Extracted from services/pubsub/handler.ts (`processBounce` + `processReply`)
 * in Phase 4c.4. Those two methods were near-duplicate — same dedupe check,
 * same sentEvent lookup, same event write, same contact update, same stats
 * call; they differed only in event type, contact status, and the metadata
 * payload. This single function subsumes both.
 *
 * Repos are injected (no module-level singletons); `updateSequenceStats` is
 * the lib/stats entrypoint both originals called. Behavior is identical to
 * the two originals end-to-end (Group C cases 1 + 2 pin the rows written).
 */
import type { HistoryChange } from "@coldjot/types";
import { EmailEventEnum, NotificationType } from "@coldjot/types";
import type { EmailEventRepository } from "@/repositories/email-event.repo";
import type { SequenceContactRepository } from "@/repositories/sequence-contact.repo";
import type { EmailThreadRepository } from "@/repositories/email-thread.repo";
import { updateSequenceStats } from "@/lib/stats";
import { nextContactStatus } from "./states";

export interface ApplyClassificationDeps {
  emailEvent: EmailEventRepository;
  sequenceContact: SequenceContactRepository;
  emailThread: EmailThreadRepository;
}

/**
 * Apply a reply/bounce classification. No-op for classifications that don't
 * map to a terminal status (ORIGINAL_MESSAGE, MESSAGE_ADDED) — returns early.
 *
 * Returns the created EmailEvent id, or null when nothing was written (no
 * thread, already-recorded event, or no prior SENT event to attach to).
 */
export async function applyClassification(input: {
  change: HistoryChange;
  deps: ApplyClassificationDeps;
}): Promise<string | null> {
  const { change, deps } = input;
  const { emailEvent, sequenceContact, emailThread } = deps;

  if (change.type !== NotificationType.BOUNCE && change.type !== NotificationType.REPLY) {
    return null;
  }

  const eventType =
    change.type === NotificationType.BOUNCE
      ? EmailEventEnum.BOUNCED
      : EmailEventEnum.REPLIED;

  const emailThreadRow = await emailThread.findByThread(change.threadId, true);

  if (!emailThreadRow) {
    return null;
  }

  const { sequenceId, contactId } = emailThreadRow;

  // Idempotency: if we've already recorded this event type for this
  // sequence+contact, do nothing. (Matches the originals' early return.)
  const existing = await emailEvent.findFirstBySequenceContactType(
    sequenceId,
    contactId,
    eventType
  );
  if (existing) {
    return null;
  }

  // The bounce/reply event links back to the original send via trackingId.
  const sentEvent = await emailEvent.findFirstBySequenceContactType(
    sequenceId,
    contactId,
    EmailEventEnum.SENT
  );
  if (!sentEvent) {
    return null;
  }

  const metadata =
    change.type === NotificationType.BOUNCE
      ? {
          messageId: change.messageId,
          threadId: change.threadId,
          bounceReason: "Email delivery failed",
        }
      : {
          messageId: change.messageId,
          threadId: change.threadId,
          from: change.from,
        };

  const created = await emailEvent.create({
    trackingId: sentEvent.trackingId,
    type: eventType,
    sequenceId,
    contactId,
    metadata: metadata as any,
  });

  const newStatus = nextContactStatus(change.type);
  if (newStatus) {
    await sequenceContact.markTerminalBySequenceContact(sequenceId, contactId, {
      status: newStatus,
      completed: true,
      completedAt: new Date(),
    });
  }

  await updateSequenceStats(sequenceId, eventType, contactId);

  return created.id;
}
