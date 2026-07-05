/**
 * Repository interface for the BusinessHours model.
 * Call sites: routes/sequence/controller (getSequenceBusinessHours).
 */

import type { BusinessHours } from "@coldjot/types";

export interface BusinessHoursRepository {
  /** Fetch business hours for a sequence (by userId + sequenceId). */
  findBySequence(userId: string, sequenceId: string): Promise<BusinessHours | null>;
  /** Create default business hours for a sequence. */
  createForSequence(
    userId: string,
    sequenceId: string,
    defaults: BusinessHours
  ): Promise<BusinessHours>;
}
