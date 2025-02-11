import { EmailTrackingEnum } from "./enums";

export interface EmailTrackingMetadata {
  email: string;
  userId: string;
  sequenceId?: string;
  stepId?: string;
  contactId?: string;
  subject?: string;
  [key: string]: any;
}

export interface EmailEventMetadata {
  messageId?: string;
  threadId?: string;
  stepId?: string;
  openCount?: number;
  linkId?: string;
  originalUrl?: string;
  bounceReason?: string;
  [key: string]: any;
}

export interface EmailTracking {
  id: string;
  hash: string;
  metadata: EmailTrackingMetadata;
  type: EmailTrackingEnum;
  pixel: string;
  wrappedLinks: boolean;
  trackingId: string;
}
