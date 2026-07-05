import type { BusinessHours } from "@coldjot/types";

/**
 * Repository interface for the Sequence model.
 * Call sites: routes/sequence/controller (launch/pause/resume/reset),
 * pubsub/helper, jobs/sequence/helper, jobs/email/processor.
 */

export interface SequenceRecord {
  id: string;
  userId: string;
  status: string;
  testMode: boolean;
  disableSending: boolean;
}

export interface SequenceWithLaunchGraph extends SequenceRecord {
  businessHours: BusinessHours | null;
  steps: Array<{ id: string; order: number }>;
  contacts: Array<{
    id: string;
    contactId: string;
    status: string;
    contact: { id: string; email: string };
  }>;
}

export interface SequenceWithDetails extends SequenceRecord {
  sequenceMailboxId: string;
  sequenceMailbox?: { id: string } | null;
  businessHours: BusinessHours | null;
  steps: Array<{
    id: string;
    sequenceId: string;
    order: number;
    stepType: string;
    priority: any;
    timing: string;
    delayAmount: number | null;
    delayUnit: string | null;
    subject: string | null;
    content: string | null;
    includeSignature: boolean | null;
    note: string | null;
    previousStepId: string | null;
    replyToThread: boolean | null;
    templateId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
}

export interface SequenceRepository {
  /** Load sequence by id+userId (ownership check). */
  findByIdForUser(id: string, userId: string): Promise<SequenceRecord | null>;
  /** Load sequence with businessHours + active contacts + steps (launch). */
  findForLaunch(
    id: string,
    userId: string,
    excludeStatuses: string[]
  ): Promise<SequenceWithLaunchGraph | null>;
  /** Load sequence with mailbox + steps + businessHours (process helpers). */
  findWithDetails(id: string): Promise<SequenceWithDetails | null>;
  /** Load sequence + businessHours only (email processor). */
  findWithBusinessHours(id: string): Promise<{ businessHours: BusinessHours | null } | null>;
  /** Set status (active/paused/draft). */
  setStatus(id: string, status: string): Promise<void>;
  /** Reset a sequence back to draft + clear flags. */
  resetToDraft(id: string): Promise<void>;
}
