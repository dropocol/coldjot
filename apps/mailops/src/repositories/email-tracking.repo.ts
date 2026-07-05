/**
 * Repository interfaces for the email-tracking domain.
 *
 * Derived from current Prisma call sites (see plans/mailops-refactor/phase-1-
 * seams-composition-root.md §1.2). Methods are named by intent; args/returns
 * are domain shapes — no @prisma/client leak.
 *
 * Prisma implementations live in `./prisma/`; the interface is the only thing
 * callers depend on.
 */

import type {
  EmailEventEnum,
  EmailTrackingMetadata,
} from "@coldjot/types";

/** Tracking row contract returned to callers (subset callers actually read). */
export interface EmailTrackingRecord {
  id: string;
  hash: string;
  status: string;
  messageId: string | null;
  threadId: string | null;
  subject: string | null;
  userId: string;
  sequenceId: string;
  contactId: string;
  stepId: string;
  openCount: number;
  metadata: EmailTrackingMetadata;
}

export interface CreatePendingInput {
  id?: string;
  hash: string;
  userId: string;
  sequenceId: string;
  stepId: string;
  contactId: string;
  subject?: string;
  jobId?: string;
  metadata: EmailTrackingMetadata;
  /** Override the default "pending" status (e.g. SENT for the post-send path). */
  status?: string;
  /** Set when the record is created post-send (skips the markSent step). */
  messageId?: string;
  threadId?: string;
  sentAt?: Date;
}

export interface SentDetails {
  messageId?: string;
  threadId?: string;
  /** Untracked sent-copy id (removed after details are recovered). */
  untrackedMessageId?: string;
}

export interface EmailTrackingWithOpenEvents extends EmailTrackingRecord {
  /** OPENED events only. */
  events: { id: string }[];
}

export interface EmailTrackingWithLink extends EmailTrackingRecord {
  /** The single matching link (empty when not found). */
  links: { id: string }[];
}

export interface EmailTrackingRepository {
  /** Create a tracking row at status=pending (default) or override. */
  createPending(input: CreatePendingInput): Promise<EmailTrackingRecord>;
  /** Look up by tracking hash. */
  findByHash(hash: string): Promise<EmailTrackingRecord | null>;
  /** Idempotency guard: find a SENT tracking for a jobId. */
  findSentByJobId(jobId: string): Promise<{ id: string } | null>;
  /** Fetch tracking + its OPENED events (first-open detection). */
  findWithOpenEvents(hash: string): Promise<EmailTrackingWithOpenEvents | null>;
  /** Fetch tracking filtered to one link id (click handling). */
  findWithLink(hash: string, linkId: string): Promise<EmailTrackingWithLink | null>;
  /** Look up by primary id. */
  findById(id: string): Promise<EmailTrackingRecord | null>;
  /** Count tracking rows in a thread (new-thread vs. reply decision). */
  countByThread(threadId: string): Promise<number>;
  /** Earliest non-empty subject on a thread (reply-subject fallback). */
  findEarliestSubjectInThread(threadId: string): Promise<string | null>;
  /** Mark a tracking row SENT + write the nested SENT event atomically. */
  markSent(
    trackingId: string,
    details: SentDetails,
    subject: string,
    sequenceId: string,
    contactId: string,
    metadata: Record<string, unknown>
  ): Promise<void>;
  /** Increment open count, set OPENED status, write nested OPENED event. */
  recordOpen(
    hash: string,
    sequenceId: string,
    contactId: string,
    metadata: Record<string, unknown>
  ): Promise<void>;
  /** Set CLICKED status, set clickedAt, write nested CLICKED event. */
  recordClick(
    trackingId: string,
    sequenceId: string,
    contactId: string,
    timestamp: Date,
    metadata: Record<string, unknown>
  ): Promise<void>;
  /** Set the tracking status from an event type (trackEmailEvent path). */
  setStatus(id: string, status: EmailEventEnum | string): Promise<void>;
  /** Bulk delete by sequenceId (sequence reset). */
  deleteBySequence(sequenceId: string): Promise<void>;
}
