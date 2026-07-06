import { EmailTrackingEnum } from "./enums";

export interface EmailTrackingMetadata {
  email: string;
  userId: string;
  sequenceId?: string;
  stepId?: string;
  contactId?: string;
  subject?: string;
  jobId?: string;
  [key: string]: any;
}

/**
 * Metadata attached to an email event (open, click, bounce, reply, ...).
 * Canonical merge of the legacy shared `EmailEventMetadata` and mailops'
 * `EventMetadata`.
 */
export interface EmailEventMetadata {
  messageId?: string;
  threadId?: string;
  stepId?: string;
  sequenceId?: string;
  contactId?: string;
  openCount?: number;
  linkId?: string;
  originalUrl?: string;
  bounceReason?: string;
  userAgent?: string;
  ipAddress?: string;
  location?: string;
  deviceType?: string;
  replyMessageId?: string;
  from?: string;
  snippet?: string;
  timestamp?: string;
  [key: string]: any;
}

/**
 * Tracking envelope used at send-time (pixel + wrapped links).
 * Distinct from the DB-aligned `EmailTracking` row shape in `./email.ts`.
 */
export interface EmailTracking {
  id: string;
  hash: string;
  metadata: EmailTrackingMetadata;
  type: EmailTrackingEnum;
  pixel: string;
  wrappedLinks: boolean;
  trackingId: string;
}

// ─── Repository record shapes (mailops v2: lived in *.repo.ts, now here) ──────

import type { EmailEventEnum } from "./enums";

/** EmailTracking row contract returned to callers (subset callers read). */
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
  openedAt: Date | null;
  clickedAt: Date | null;
  jobId: string | null;
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
  links: { id: string; originalUrl: string }[];
}

/** EmailEvent row contract. */
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
  sequenceId?: string;
  contactId?: string;
  metadata?: EmailEventMetadata;
  timestamp?: Date;
}

/** TrackedLink row contract. */
export interface TrackedLinkRecord {
  id: string;
  emailTrackingId: string;
  originalUrl: string;
  clickCount: number;
}

export interface TrackedLinkWithTracking extends TrackedLinkRecord {
  emailTracking: {
    id: string;
    hash: string;
    sequenceId: string;
    contactId: string;
  };
}
