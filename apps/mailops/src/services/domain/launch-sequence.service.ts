/**
 * Domain service interface — sequence lifecycle (launch/pause/resume/reset).
 *
 * The HTTP controller (`controllers/sequence.controller.ts`) is a thin adapter
 * that catches the typed errors below and maps them to HTTP statuses. The
 * service itself is HTTP-agnostic — it throws domain errors, callers decide
 * what to do with them.
 */
import {
  BusinessHours,
  BusinessScheduleEnum,
  ProcessingJobEnum,
  type ProcessingJob,
  type SequenceWithLaunchGraph,
} from "@coldjot/types";
import type { Db } from "@coldjot/database";
import { logger } from "@/lib/log";

import type { JobManager } from "@/services/jobs/job-manager";
import type { MonitoringService } from "@/services/monitor/service";
import type { RateLimitService } from "@/services/core/rate-limit/service";

import { resetSequence } from "@/services/jobs/sequence/helper";

// ---- Typed domain errors (controller catches → HTTP status) ---------------

export class SequenceNotFoundError extends Error {
  constructor() {
    super("Sequence not found");
    this.name = "SequenceNotFoundError";
  }
}

export class SequenceHasNoStepsError extends Error {
  constructor() {
    super("Sequence has no steps");
    this.name = "SequenceHasNoStepsError";
  }
}

export class SequenceHasNoContactsError extends Error {
  constructor() {
    super("Sequence has no active contacts");
    this.name = "SequenceHasNoContactsError";
  }
}

// ---- Interface -----------------------------------------------------------

export interface LaunchSequenceService {
  launch(
    sequenceId: string,
    userId: string
  ): Promise<{ jobId: string; contactCount: number; stepCount: number }>;
  pause(sequenceId: string, userId: string): Promise<void>;
  resume(sequenceId: string, userId: string): Promise<void>;
  reset(sequenceId: string, userId: string): Promise<void>;
}

// ---- Implementation ------------------------------------------------------

/**
 * Live `LaunchSequenceServiceImpl` — the canonical sequence-lifecycle path.
 *
 * Extracted from `controllers/sequence.controller.ts` in Phase 7.2a. The
 * controller's four handlers (`launchSequence` / `pauseSequence` /
 * `resumeSequence` / `resetSequenceHandler`) used to do their own repo writes,
 * status checks, and jobManager/monitoring calls inline; that logic now lives
 * here behind the `LaunchSequenceService` interface, and the controller is a
 * thin HTTP adapter that maps the typed errors to 404/400.
 *
 * Behavior is identical to the pre-refactor controller:
 *   - launch: validate (404/400 semantics via typed errors) → set status
 *     "active" → add the SEQUENCE ProcessingJob → start monitoring.
 *   - pause:  set "paused" + stop monitoring.
 *   - resume: set "active" + start monitoring.
 *   - reset:  stop monitoring → reset rate limits → wipe tracking/events/
 *     contacts/stats/health → reset sequence status to draft.
 *
 * mailops v2: data access goes through the `db` client's domain extension
 * methods (`db.sequence.findForLaunch`, `db.businessHours.createForSequence`,
 * etc.), defined once in `packages/database/src/domain-extension.ts` and
 * composed onto the Prisma client. No repository layer.
 */
export class LaunchSequenceServiceImpl implements LaunchSequenceService {
  constructor(
    private readonly db: Db,
    private readonly jobManager: JobManager,
    private readonly monitoring: MonitoringService,
    private readonly rateLimitService: Pick<RateLimitService, "resetLimits">
  ) {}

  async launch(
    sequenceId: string,
    userId: string
  ): Promise<{ jobId: string; contactCount: number; stepCount: number }> {
    // Get sequence and validate.
    const sequence = await this.db.sequence.findForLaunch(
      sequenceId,
      userId,
      ["completed", "opted_out"]
    );

    if (!sequence) {
      throw new SequenceNotFoundError();
    }

    if (sequence.steps.length === 0) {
      throw new SequenceHasNoStepsError();
    }

    if (sequence.contacts.length === 0) {
      throw new SequenceHasNoContactsError();
    }

    // Get-or-create business hours settings.
    const businessHours = await this.getSequenceBusinessHours(
      sequenceId,
      userId
    );

    // Update sequence status.
    await this.db.sequence.setStatus(sequenceId, "active");

    const processingJob: ProcessingJob = {
      sequenceId,
      type: ProcessingJobEnum.SEQUENCE,
      userId,
      scheduleType:
        businessHours?.type === BusinessScheduleEnum.BUSINESS
          ? BusinessScheduleEnum.BUSINESS
          : BusinessScheduleEnum.CUSTOM,
      businessHours,
      testMode: sequence.testMode,
      disableSending: sequence.disableSending,
    };

    const job = await this.jobManager.addSequenceJob(processingJob);
    await this.monitoring.startMonitoring(sequenceId);

    return {
      jobId: job.id!,
      contactCount: sequence.contacts.length,
      stepCount: sequence.steps.length,
    };
  }

  async pause(sequenceId: string, userId: string): Promise<void> {
    const sequence = await this.db.sequence.findByIdForUser(sequenceId, userId);
    if (!sequence) {
      throw new SequenceNotFoundError();
    }

    await this.db.sequence.setStatus(sequenceId, "paused");
    this.monitoring.stopMonitoring(sequenceId);
  }

  async resume(sequenceId: string, userId: string): Promise<void> {
    const sequence = await this.db.sequence.findByIdForUser(sequenceId, userId);
    if (!sequence) {
      throw new SequenceNotFoundError();
    }

    await this.db.sequence.setStatus(sequenceId, "active");
    await this.monitoring.startMonitoring(sequenceId);
  }

  async reset(sequenceId: string, userId: string): Promise<void> {
    const sequence = await this.db.sequence.findByIdForUser(sequenceId, userId);
    if (!sequence) {
      throw new SequenceNotFoundError();
    }

    this.monitoring.stopMonitoring(sequenceId);
    logger.info(`Stopped monitoring sequence ${sequenceId}`);

    await this.rateLimitService.resetLimits(userId, sequenceId);
    logger.info(`Rate limits reset for sequence ${sequenceId}`);

    await resetSequence(sequenceId);
    logger.info(`Sequence data reset for ${sequenceId}`);

    await this.db.sequence.resetToDraft(sequenceId);
    logger.info(`Sequence status reset to draft`);
  }

  /** Get the sequence's business hours, creating defaults if absent. */
  private async getSequenceBusinessHours(
    sequenceId: string,
    userId: string
  ): Promise<BusinessHours> {
    const settings = await this.db.businessHours.findBySequence(
      userId,
      sequenceId
    );
    if (!settings) {
      return this.db.businessHours.createForSequence(
        userId,
        sequenceId,
        DEFAULT_BUSINESS_HOURS
      );
    }
    return settings;
  }
}

/** Default business hours used when a sequence has none set yet. */
const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  workDays: [1, 2, 3, 4, 5], // Monday to Friday
  workHoursStart: "09:00",
  workHoursEnd: "17:00",
  type: BusinessScheduleEnum.BUSINESS,
};
