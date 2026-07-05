/**
 * SequenceContact status transitions for inbox-sync classifications.
 *
 * Extracted from services/pubsub/helper.ts (`determineNewStatus`) in Phase
 * 4c.3 (move-only). Pure: given the notification classification, return the
 * terminal SequenceContact status to apply, or null when no transition is
 * needed (e.g. ORIGINAL_MESSAGE / MESSAGE_ADDED).
 *
 * The mapping is pinned by Group C characterization tests — REPLY → REPLIED,
 * BOUNCE → BOUNCED, anything else → null (no change).
 */
import {
  NotificationType,
  SequenceContactStatusEnum,
} from "@coldjot/types";

export function nextContactStatus(
  classification: NotificationType
): SequenceContactStatusEnum | null {
  switch (classification) {
    case NotificationType.REPLY:
      return SequenceContactStatusEnum.REPLIED;
    case NotificationType.BOUNCE:
      return SequenceContactStatusEnum.BOUNCED;
    default:
      return null;
  }
}
