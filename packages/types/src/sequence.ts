import { z } from "zod";
import { BusinessScheduleEnum, SequenceContactStatusEnum } from "./enums";
import type { SequenceMailbox } from "./mailbox";

// ─── Enums ───────────────────────────────────────────────────────────────────

export enum StepTypeEnum {
  MANUAL_EMAIL = "MANUAL_EMAIL",
  AUTOMATED_EMAIL = "AUTOMATED_EMAIL",
  WAIT = "WAIT",
  CONDITION = "CONDITION",
  ACTION = "ACTION",
}

export type StepType = StepTypeEnum;

export enum TimingType {
  IMMEDIATE = "immediate",
  DELAY = "delay",
  SCHEDULED = "scheduled",
}

export enum StepPriority {
  HIGH = "high",
  NORMAL = "normal",
  LOW = "low",
}

export enum StepStatus {
  NOT_SENT = "not_sent",
  DRAFT = "draft",
  ACTIVE = "active",
  PAUSED = "paused",
  COMPLETED = "completed",
  ERROR = "error",
  PENDING = "pending",
  SCHEDULED = "scheduled",
  SENT = "sent",
  FAILED = "failed",
  BOUNCED = "bounced",
}

export enum SequenceStatus {
  DRAFT = "draft",
  ACTIVE = "active",
  PAUSED = "paused",
  COMPLETED = "completed",
  ERROR = "error",
}

// ─── Timing / schedule ───────────────────────────────────────────────────────

export type StepTiming = "immediate" | "delay";

export type BusinessScheduleType = BusinessScheduleEnum;

export interface BusinessHours {
  timezone: string;
  workDays: number[];
  workHoursStart: string;
  workHoursEnd: string;
  type: BusinessScheduleType;
}

// ─── Repository record shapes (mailops v2: lived in *.repo.ts, now here) ──────

/**
 * Base shape of a Sequence row as read from the DB. Narrower than the full
 * `Sequence` type (which is the API response shape); this is the persistence
 * record. Owned here so both the database package (Prisma extension) and
 * mailops consumers share one definition.
 */
export interface SequenceRecord {
  id: string;
  userId: string;
  status: string;
  testMode: boolean;
  disableSending: boolean;
}

/**
 * Sequence + businessHours + active contacts + steps — the graph
 * `launch-sequence` needs to validate + dispatch a launch.
 */
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

/**
 * Sequence + sequenceMailbox + steps + businessHours — the graph used by the
 * sequence/email processors. Carries both the nested `sequenceMailbox`
 * relation and the flattened `sequenceMailboxId` for legacy consumers.
 */
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

// ─── Core types ──────────────────────────────────────────────────────────────

export interface SequenceStep {
  id: string;
  sequenceId: string;
  stepType: StepType;
  priority: StepPriority;
  timing: StepTiming;
  delayAmount?: number | null;
  delayUnit?: string | null;
  subject?: string | null;
  content?: string | null;
  includeSignature: boolean;
  note?: string | null;
  order: number;
  previousStepId?: string | null;
  replyToThread?: boolean;
  createdAt: Date;
  updatedAt: Date;
  templateId?: string | null;
}

export interface Sequence {
  id: string;
  name: string;
  description?: string | null;
  status: SequenceStatus;
  accessLevel: "team" | "private";
  scheduleType: "business" | "custom";
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  /** Arbitrary metadata blob stored as JSON in the DB (e.g. readiness flags). */
  metadata?: Record<string, unknown> | null;
  steps: SequenceStep[];
  contacts: SequenceContact[];
  _count: {
    contacts: number;
  };
  /** Computed convenience field populated by the API/layout layer. */
  contactCount?: number;
  testMode: boolean;
  disableSending: boolean;
  testEmails: string[];
  businessHours?: BusinessHours;
  sequenceMailbox?: SequenceMailbox;
}

export interface SequenceContact {
  id: string;
  sequenceId: string;
  contactId: string;
  status: StepStatus;
  currentStep: number;
  startedAt: Date;
  updatedAt: Date;
  lastProcessedAt?: Date | null;
  completedAt?: Date | null;
  threadId?: string | null;
  contact: {
    id: string;
    name: string;
    email: string;
  };
}

/** Response shape of GET /api/sequences/[id]/contacts. */
export interface SequenceContactsResponse {
  contacts: SequenceContact[];
  totalSteps: number;
  total: number;
}

// ─── Readiness (stored on Sequence.metadata.readiness) ───────────────────────

export interface SequenceReadinessMetadata {
  hasSteps: boolean;
  hasContacts: boolean;
  hasBusinessHours: boolean;
  hasMailbox: boolean;
  lastUpdated?: string; // ISO date string
}

export interface SequenceReadinessResult {
  isReady: boolean;
  steps: SequenceReadinessMetadata;
}

/** Canonical (richer) SequenceStats shape — combines both legacy declarations. */
export interface SequenceStats {
  id: string;
  sequenceId: string;
  contactId?: string | null;
  totalEmails: number;
  sentEmails: number;
  openedEmails: number;
  uniqueOpens: number;
  clickedEmails: number;
  repliedEmails: number;
  bouncedEmails: number;
  failedEmails: number;
  unsubscribed: number;
  interested: number;
  peopleContacted: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
  avgOpenTime?: number | null;
  avgClickTime?: number | null;
  avgReplyTime?: number | null;
  avgResponseTime?: number | null;
  Contact?: {
    id: string;
    name: string;
    email: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Processing window / rate limits ─────────────────────────────────────────

export interface ProcessingWindow {
  start: Date;
  end: Date;
  timezone: string;
  maxJobsPerWindow: number;
  currentLoad: number;
}

export interface RateLimits {
  perMinute: number;
  perHour: number;
  perDay: number;
  perContact: number;
  perSequence: number;
  cooldown: {
    afterBounce: number;
    afterError: number;
  };
}

// ─── Step / email data ───────────────────────────────────────────────────────

export interface StepData {
  stepType: StepType;
  timing: StepTiming;
  priority: StepPriority;
  delayAmount?: number;
  delayUnit?: "minutes" | "hours" | "days";
  maxEmailsPerDay?: number;
  skipIfPastDue?: boolean;
  note?: string;
}

export interface EmailData {
  subject: string;
  content: string;
  includeSignature: boolean;
  replyToThread?: boolean;
  /** A template id, or null to explicitly clear the link. */
  templateId?: string | null;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const launchSequenceSchema = z.object({
  // Fixes a bug where {"testMode":"yes"} passed a truthy string.
  testMode: z.boolean().default(false),
});
export type LaunchSequenceInput = z.infer<typeof launchSequenceSchema>;

export const addContactToSequenceSchema = z.object({
  contactId: z.string().min(1),
});
export type AddContactToSequenceInput = z.infer<
  typeof addContactToSequenceSchema
>;

/** Body of POST /api/sequences (create sequence). */
export const createSequenceSchema = z.object({
  name: z.string().trim().min(1).max(200),
  permissions: z.enum(["team", "private"]),
  schedule: z.enum(["business", "custom"]),
});
export type CreateSequenceInput = z.infer<typeof createSequenceSchema>;

// Allowlist + strict: rejects unknown keys to close the mass-assignment gap.
export const updateSequenceStepSchema = z
  .object({
    subject: z.string().max(200).nullable().optional(),
    content: z.string().nullable().optional(),
    body: z.string().nullable().optional(),
    delayAmount: z.number().int().min(0).max(365).nullable().optional(),
    delayUnit: z.string().max(20).nullable().optional(),
    timing: z.string().max(50).nullable().optional(),
    priority: z.string().max(50).nullable().optional(),
    stepType: z.string().max(50).nullable().optional(),
    includeSignature: z.boolean().nullable().optional(),
    note: z.string().nullable().optional(),
    replyToThread: z.boolean().nullable().optional(),
    previousStepId: z.string().nullable().optional(),
    templateId: z.string().nullable().optional(),
    order: z.number().int().min(0).nullable().optional(),
    waitDays: z.number().int().min(0).max(365).nullable().optional(),
    waitHours: z.number().int().min(0).max(23).nullable().optional(),
  })
  .strict();
export type UpdateSequenceStepInput = z.infer<typeof updateSequenceStepSchema>;

// ─── SequenceContact record shapes (mailops v2) ──────────────────────────────

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
  nextScheduledAt: Date | null;
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

// ─── SequenceStep record shapes (mailops v2) ──────────────────────────────────

export interface SequenceStepRecord {
  id: string;
  sequenceId: string;
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
}

export interface StepWithSequenceMeta extends SequenceStepRecord {
  sequence: { id: string; userId: string; status: string; name: string };
}

// ─── SequenceStats record shapes (mailops v2: lived in sequence-stats.repo.ts) ──

/**
 * Narrow SequenceStats row shape as read by the repository. Distinct from the
 * richer `SequenceStats` API type above; this is the persistence record owned
 * here so the database extension and mailops share one definition.
 */
export interface SequenceStatsRecord {
  sequenceId: string;
  totalEmails: number;
  sentEmails: number;
  openedEmails: number;
  uniqueOpens?: number | null;
  clickedEmails: number;
  repliedEmails: number;
  bouncedEmails: number;
  failedEmails?: number | null;
  unsubscribed?: number | null;
  interested?: number | null;
  peopleContacted?: number | null;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
  contactId?: string | null;
}

/** Partial counter set used by `updateCounts` (increment + recompute rates). */
export interface StatsCounts {
  totalEmails?: number;
  sentEmails?: number;
  openedEmails?: number;
  clickedEmails?: number;
  repliedEmails?: number;
  bouncedEmails?: number;
}
