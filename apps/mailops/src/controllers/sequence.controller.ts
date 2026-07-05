import type { JobManager } from "@/services/jobs/job-manager";
import { MonitoringService } from "@/services/monitor/service";
import type { RateLimitService } from "@/services/core/rate-limit/service";
import { resetSequence } from "@/services/jobs/sequence/helper";
import { logger } from "@/lib/log";
import { ProcessingJobEnum, BusinessScheduleEnum } from "@coldjot/types";
import type {
  BusinessHours,
  ProcessingJob,
} from "@coldjot/types";
import {
  ok,
  badRequest,
  notFound,
  serverError,
  type ControllerResult,
} from "./utils";
import type { SequenceRepository } from "@/repositories/sequence.repo";
import type { BusinessHoursRepository } from "@/repositories/business-hours.repo";

/**
 * Phase 6.4: sequence controller is a factory function. Deps that used to be
 * module-level singletons (ServiceManager.getInstance(), MonitoringService,
 * the repos) are passed in by the composition root.
 */
export interface SequenceControllerDeps {
  jobManager: JobManager;
  monitoringService: MonitoringService;
  sequenceRepo: SequenceRepository;
  businessHoursRepo: BusinessHoursRepository;
  rateLimitService: Pick<RateLimitService, "resetLimits">;
}

export function createSequenceController(deps: SequenceControllerDeps) {
  const { jobManager, monitoringService, sequenceRepo, businessHoursRepo, rateLimitService } = deps;

  const DEFAULT_BUSINESS_HOURS: BusinessHours = {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    workDays: [1, 2, 3, 4, 5], // Monday to Friday
    workHoursStart: "09:00",
    workHoursEnd: "17:00",
    type: BusinessScheduleEnum.BUSINESS,
  };

  // TODO : move to helper file
  async function getSequenceBusinessHours(
    sequenceId: string,
    userId: string
  ): Promise<BusinessHours> {
    const settings = await businessHoursRepo.findBySequence(userId, sequenceId);
    if (!settings) {
      return businessHoursRepo.createForSequence(
        userId,
        sequenceId,
        DEFAULT_BUSINESS_HOURS
      );
    }
    return settings;
  }

  async function launchSequence(
    id: string,
    body: { userId: string }
  ): Promise<ControllerResult> {
    try {
      const { userId } = body;

      // Get sequence and validate
      const sequence = await sequenceRepo.findForLaunch(id, userId, [
        "completed",
        "opted_out",
      ]);

      if (!sequence) {
        return notFound("Sequence not found");
      }

      if (sequence.steps.length === 0) {
        return badRequest("Sequence has no steps");
      }

      if (sequence.contacts.length === 0) {
        return badRequest("Sequence has no active contacts");
      }

      // Get business hours settings
      const businessHours = await getSequenceBusinessHours(id, userId);

      // Update sequence status
      await sequenceRepo.setStatus(id, "active");

      const type = ProcessingJobEnum.SEQUENCE;
      const processingJob: ProcessingJob = {
        sequenceId: id,
        type: type,
        userId,
        scheduleType:
          businessHours?.type === BusinessScheduleEnum.BUSINESS
            ? BusinessScheduleEnum.BUSINESS
            : BusinessScheduleEnum.CUSTOM,
        businessHours,
        testMode: sequence.testMode,
        disableSending: sequence.disableSending,
      };

      const job = await jobManager.addSequenceJob(processingJob);
      await monitoringService.startMonitoring(id);

      return ok({
        success: true,
        jobId: job.id,
        contactCount: sequence.contacts.length,
        stepCount: sequence.steps.length,
      });
    } catch (error) {
      logger.error({ err: error }, "Error launching sequence");
      return serverError("Failed to launch sequence");
    }
  }

  async function pauseSequence(
    id: string,
    body: { userId: string }
  ): Promise<ControllerResult> {
    try {
      const { userId } = body;
      const sequence = await sequenceRepo.findByIdForUser(id, userId);

      if (!sequence) {
        return notFound("Sequence not found");
      }

      await sequenceRepo.setStatus(id, "paused");
      await monitoringService.stopMonitoring(id);

      return ok({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error pausing sequence");
      return serverError("Failed to pause sequence");
    }
  }

  async function resumeSequence(
    id: string,
    body: { userId: string }
  ): Promise<ControllerResult> {
    try {
      const { userId } = body;
      const sequence = await sequenceRepo.findByIdForUser(id, userId);

      if (!sequence) {
        return notFound("Sequence not found");
      }

      await sequenceRepo.setStatus(id, "active");
      await monitoringService.startMonitoring(id);

      return ok({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Error resuming sequence");
      return serverError("Failed to resume sequence");
    }
  }

  async function resetSequenceHandler(
    id: string,
    body: { userId: string }
  ): Promise<ControllerResult> {
    try {
      const { userId } = body;
      const sequence = await sequenceRepo.findByIdForUser(id, userId);

      if (!sequence) {
        return notFound("Sequence not found");
      }

      await monitoringService.stopMonitoring(id);
      logger.info(`Stopped monitoring sequence ${id}`);

      await rateLimitService.resetLimits(userId, id);
      logger.info(`Rate limits reset for sequence ${id}`);

      await resetSequence(id);
      logger.info(`Sequence data reset for ${id}`);

      await sequenceRepo.resetToDraft(id);
      logger.info(`Sequence status reset to draft`);

      return ok({
        success: true,
        message: "Sequence reset successfully",
      });
    } catch (error) {
      logger.error({ err: error }, "Error resetting sequence");
      return serverError("Failed to reset sequence");
    }
  }

  return {
    launchSequence,
    pauseSequence,
    resumeSequence,
    resetSequenceHandler,
  };
}
