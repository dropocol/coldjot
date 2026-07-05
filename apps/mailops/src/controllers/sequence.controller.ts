import { prisma } from "@coldjot/database";
import { ServiceManager } from "@/services/service-manager";
import { MonitoringService } from "@/services/monitor/service";
import { rateLimitService } from "@/services/core/rate-limit/service";
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
import { PrismaSequenceRepository } from "@/repositories/prisma/prisma-sequence.repo";
import { PrismaBusinessHoursRepository } from "@/repositories/prisma/prisma-business-hours.repo";

const sequenceRepo = new PrismaSequenceRepository();
const businessHoursRepo = new PrismaBusinessHoursRepository();

// Initialize services
const serviceManager = ServiceManager.getInstance();
const jobManager = serviceManager.getJobManager();

// Update monitoring service to use schedule service
const monitoringService = new MonitoringService(serviceManager);

const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  workDays: [1, 2, 3, 4, 5], // Monday to Friday
  workHoursStart: "09:00",
  workHoursEnd: "17:00",
  type: BusinessScheduleEnum.BUSINESS,
};

// TODO : move to helper file
// Helper function to get business hours
async function getSequenceBusinessHours(
  sequenceId: string,
  userId: string
): Promise<BusinessHours> {
  const settings = await businessHoursRepo.findBySequence(userId, sequenceId);

  if (!settings) {
    // create default business hours
    return businessHoursRepo.createForSequence(
      userId,
      sequenceId,
      DEFAULT_BUSINESS_HOURS
    );
  }

  return settings;
}

export async function launchSequence(
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
    // Create and schedule the job
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

    // Add the job using the job manager
    const job = await jobManager.addSequenceJob(processingJob);

    // Start monitoring the sequence
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

export async function pauseSequence(
  id: string,
  body: { userId: string }
): Promise<ControllerResult> {
  try {
    const { userId } = body;

    // Validate sequence ownership
    const sequence = await sequenceRepo.findByIdForUser(id, userId);

    if (!sequence) {
      return notFound("Sequence not found");
    }

    // Update sequence status
    await sequenceRepo.setStatus(id, "paused");

    // Stop monitoring
    await monitoringService.stopMonitoring(id);

    return ok({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error pausing sequence");
    return serverError("Failed to pause sequence");
  }
}

export async function resumeSequence(
  id: string,
  body: { userId: string }
): Promise<ControllerResult> {
  try {
    const { userId } = body;

    // Validate sequence ownership
    const sequence = await sequenceRepo.findByIdForUser(id, userId);

    if (!sequence) {
      return notFound("Sequence not found");
    }

    // Update sequence status
    await sequenceRepo.setStatus(id, "active");

    // Resume monitoring
    await monitoringService.startMonitoring(id);

    return ok({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error resuming sequence");
    return serverError("Failed to resume sequence");
  }
}

export async function resetSequenceHandler(
  id: string,
  body: { userId: string }
): Promise<ControllerResult> {
  try {
    const { userId } = body;

    // Verify sequence ownership
    const sequence = await sequenceRepo.findByIdForUser(id, userId);

    if (!sequence) {
      return notFound("Sequence not found");
    }

    // Stop monitoring
    await monitoringService.stopMonitoring(id);
    logger.info(`Stopped monitoring sequence ${id}`);

    // Reset rate limits
    await rateLimitService.resetLimits(userId, id);
    logger.info(`Rate limits reset for sequence ${id}`);

    // Reset sequence data
    await resetSequence(id);
    logger.info(`Sequence data reset for ${id}`);

    // Update sequence status
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
