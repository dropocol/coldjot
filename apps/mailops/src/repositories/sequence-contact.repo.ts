import type {
  SequenceContactStatusEnum,
  BusinessHours,
} from "@coldjot/types";

/**
 * Repository interface for the SequenceContact model.
 *
 * Access is dominated by the composite unique `sequenceId_contactId`; those
 * methods are named `*BySequenceAndContact`. Other access patterns cover the
 * poller (findMany by status/nextScheduledAt) and the list-sync bulk add.
 */

export interface SequenceContactRecord {
  id: string;
  sequenceId: string;
  contactId: string;
  status: SequenceContactStatusEnum | string;
  currentStep: number;
  lastProcessedAt: Date | null;
  nextScheduledAt: Date | null;
  completed: boolean;
  completedAt: Date | null;
  startedAt: Date | null;
  threadId: string | null;
  failureCount: number;
  lastError: string | null;
}

export interface UpdateStatusInput {
  status?: SequenceContactStatusEnum | string;
  completed?: boolean;
  lastProcessedAt?: Date | null;
  threadId?: string | null;
  currentStep?: number;
  nextScheduledAt?: Date | null;
  startedAt?: Date | null;
}

/** Due-contact graph used by the schedule tick (sequence + steps + mailbox). */
export interface DueContactGraph {
  id: string;
  sequenceId: string;
  contactId: string;
  currentStep: number;
  lastProcessedAt: Date | null;
  nextScheduledAt: Date | Date | null;
  completed: boolean;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  failureCount: number;
  sequence: {
    id: string;
    userId: string;
    status: string;
    testMode: boolean;
    disableSending: boolean;
    sequenceMailboxId: string;
    businessHours?: BusinessHours;
    steps: Array<{
      id: string;
      order: number;
      stepType: string;
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
    }>;
  };
  contact: { id: string; email: string };
}

/** New-contact graph used by the contact processor. */
export interface NewContactGraph {
  id: string;
  sequenceId: string;
  contactId: string;
  sequence: {
    id: string;
    sequenceMailbox: { id: string } | null;
    steps: Array<{ id: string; order: number }>;
    businessHours: BusinessHours | null;
  };
  contact: { id: string; email: string };
}

export interface SequenceContactRepository {
  /** Composite-unique lookup. */
  findBySequenceAndContact(
    sequenceId: string,
    contactId: string
  ): Promise<SequenceContactRecord | null>;
  /** Fetch only the threadId for a contact (reply routing). */
  findThreadId(sequenceId: string, contactId: string): Promise<string | null>;
  /** Update by composite unique. */
  updateBySequenceAndContact(
    sequenceId: string,
    contactId: string,
    data: UpdateStatusInput
  ): Promise<void>;
  /** Upsert progress by composite unique. */
  upsertProgress(
    sequenceId: string,
    contactId: string,
    data: {
      currentStep: number;
      lastProcessedAt: Date;
      nextScheduledAt: Date | null;
    }
  ): Promise<void>;
  /** Update by id (failure/retry path). */
  updateById(
    id: string,
    data: Partial<Pick<SequenceContactRecord, "failureCount" | "lastError" | "status" | "nextScheduledAt">>
  ): Promise<void>;
  /**
   * Mark contacts (matching sequenceId+contactId, not in final statuses) with
   * a terminal status. Used by pubsub bounce/reply. Returns the count of rows
   * updated (logged by the caller).
   */
  markTerminalBySequenceContact(
    sequenceId: string,
    contactId: string,
    data: {
      status: string;
      completed: boolean;
      completedAt: Date;
    }
  ): Promise<{ count: number }>;
  /** Bulk-add contacts (list sync, skipDuplicates). */
  addContactsToSequence(
    sequenceId: string,
    contactIds: string[]
  ): Promise<void>;
  /** List existing contactIds in a sequence (list-sync dedupe). */
  listContactIdsInSequence(sequenceId: string): Promise<string[]>;
  /** List active (non-final) contacts with contact details (launch). */
  listActiveWithContacts(
    sequenceId: string,
    excludeStatuses: string[]
  ): Promise<Array<{ id: string; contactId: string; status: string; contact: { id: string; email: string } }>>;
  /** Poller: find due contacts (schedule tick). */
  findDueContacts(now: Date): Promise<DueContactGraph[]>;
  /** Poller: find NOT_STARTED contacts (contact processor). */
  findNewContacts(batchSize: number): Promise<NewContactGraph[]>;
  /** Dev helper: peek the next scheduled contact. */
  peekNextScheduled(): Promise<{
    id: string;
    scheduledTime: Date | null;
    step: number;
    email: string;
  } | null>;
  /** Rate-limit slot check: count scheduled in [start, end). */
  countScheduledInWindow(start: Date, end: Date): Promise<number>;
  /** Bulk reset to pending on sequence reset. */
  resetBySequence(sequenceId: string): Promise<void>;
}
