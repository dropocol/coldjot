import type { EmailEventEnum, EmailEventMetadata } from "@coldjot/types";

/**
 * Repository interface for the EmailEvent model.
 * Derived from current call sites in lib/tracking, lib/stats, services/jobs,
 * and services/pubsub.
 */

export interface EmailEventRecord {
  id: string;
  trackingId: string;
  type: EmailEventEnum;
  sequenceId: string;
  contactId: string;
  metadata: EmailEventMetadata;
  timestamp: Date;
}

export interface CreateEventInput {
  trackingId: string;
  type: EmailEventEnum;
  sequenceId: string;
  contactId: string;
  metadata?: EmailEventMetadata;
  timestamp?: Date;
}

export interface EmailEventRepository {
  /** Create an event row. */
  create(input: CreateEventInput): Promise<EmailEventRecord>;
  /** Find the first event matching trackingId + type (uniqueness checks). */
  findFirstByTrackingAndType(
    trackingId: string,
    type: EmailEventEnum
  ): Promise<EmailEventRecord | null>;
  /** Find first event matching trackingId + type + sequenceId (non-click dedupe). */
  findFirstByTrackingTypeSequence(
    trackingId: string,
    type: EmailEventEnum,
    sequenceId: string
  ): Promise<EmailEventRecord | null>;
  /** Find first event of a type for a sequence+contact (bounce/reply dedupe). */
  findFirstBySequenceContactType(
    sequenceId: string,
    contactId: string,
    type: EmailEventEnum
  ): Promise<EmailEventRecord | null>;
  /** Count events of a type for a sequence+contact (uniqueness). */
  countBySequenceContactType(
    sequenceId: string,
    contactId: string,
    type: EmailEventEnum
  ): Promise<number>;
  /** Pre-send bounce/reply check across multiple types. */
  existsBySequenceContactInTypes(
    sequenceId: string,
    contactId: string,
    types: EmailEventEnum[]
  ): Promise<boolean>;
  /** Fetch all events for a tracking row. */
  listByTracking(trackingId: string): Promise<EmailEventRecord[]>;
  /** Bulk delete by sequenceId (sequence reset). */
  deleteBySequence(sequenceId: string): Promise<void>;
}
