import { z } from "zod";
import type { EmailTracking } from "./events";
import type { Mailbox } from "./mailbox";

// ─── Send options (uses the tracking envelope from events.ts) ────────────────

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  threadId?: string;
  tracking: EmailTracking;
  mailbox: Mailbox;
  userId: string;
  sequenceId: string;
  contactId: string;
  stepId: string;
  testMode?: boolean;
  disableSending?: boolean;
}

export interface SenderInfo {
  email: string;
  name?: string;
  header: string;
}

/** Result of email subject resolution (new thread vs reply). */
export interface SubjectInfo {
  subject: string;
  isReply: boolean;
  originalSubject?: string;
}

export interface EmailResponse {
  messageId: string;
  threadId?: string;
}

// ─── DB-aligned tracking row (canonical; supersedes web's local EmailTracking) ─

export interface EmailContact {
  name: string;
  email: string;
}

export interface EmailEventRow {
  id: string;
  type: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}

export interface TrackedLinkRow {
  id: string;
  originalUrl: string;
  clickCount: number;
}

/**
 * DB-aligned email-tracking row as returned by the web API.
 * This is the canonical "rich" shape; the send-time envelope of the same
 * name lives in `./events.ts`.
 */
export interface EmailTrackingRow {
  id: string;
  messageId: string;
  subject: string;
  previewText?: string;
  recipientEmail: string;
  status: string;
  metadata: Record<string, unknown>;
  sequenceId: string;
  stepId: string;
  contactId: string;
  userId: string;
  openCount: number;
  sentAt: Date | null;
  openedAt: Date | null;
  clickedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  contact?: EmailContact | null;
  events: EmailEventRow[];
  links: TrackedLinkRow[];
  // Denormalized context for table views. Populated by the timeline routes
  // (sequence name via Prisma relation, step type/order via a batched lookup).
  sequenceName?: string | null;
  stepType?: string | null;
  stepOrder?: number | null;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const sendDraftSchema = z.object({
  draftId: z.string().min(1),
});
export type SendDraftInput = z.infer<typeof sendDraftSchema>;

export const trackEventSchema = z.object({
  emailId: z.string().min(1),
});
export type TrackEventInput = z.infer<typeof trackEventSchema>;
