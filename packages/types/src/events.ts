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
