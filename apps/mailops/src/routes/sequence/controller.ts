import { Request, Response } from "express";
import { prisma } from "@coldjot/database";
import { ServiceManager } from "@/services/service-manager";
import { MonitoringService } from "@/services/monitor/service";
import { rateLimitService } from "@/services/core/rate-limit/service";
import { resetSequence } from "@/services/jobs/sequence/helper";
import { logger } from "@/lib/log";
import { ProcessingJobEnum, BusinessScheduleEnum } from "@coldjot/types";
import type { BusinessHours, ProcessingJob } from "@coldjot/types";

// Initialize services
const serviceManager = ServiceManager.getInstance();
const jobManager = serviceManager.getJobManager();

// Update monitoring service to use schedule service
const monitoringService = new MonitoringService(serviceManager);

// Helper function to get business hours
async function getBusinessHours(
  userId: string
): Promise<BusinessHours | undefined> {
  const settings = await prisma.businessHours.findFirst({
    where: { userId },
  });

  if (!settings) {
    return undefined;
  }

  return {
    timezone: settings.timezone,
    workDays: settings.workDays,
    workHoursStart: settings.workHoursStart,
    workHoursEnd: settings.workHoursEnd,
    holidays: settings.holidays,
  };
}

export async function launchSequence(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    // Get sequence and validate
    const sequence = await prisma.sequence.findUnique({
      where: {
        id,
        userId,
      },
      include: {
        steps: {
          orderBy: { order: "asc" },
        },
        contacts: {
          where: {
            status: {
              notIn: ["completed", "opted_out"],
            },
          },
          include: {
            contact: true,
          },
        },
      },
    });

    if (!sequence) {
      return res.status(404).json({ error: "Sequence not found" });
    }

    if (sequence.steps.length === 0) {
      return res.status(400).json({ error: "Sequence has no steps" });
    }

    if (sequence.contacts.length === 0) {
      return res.status(400).json({ error: "Sequence has no active contacts" });
    }

    // Get business hours settings
    const businessHours = await getBusinessHours(userId);

    // Update sequence status
    await prisma.sequence.update({
      where: { id },
      data: {
        status: "active",
      },
    });

    const type = ProcessingJobEnum.SEQUENCE;
    // Create and schedule the job
    const processingJob: ProcessingJob = {
      sequenceId: id,
      type: type,
      userId,
      scheduleType: businessHours
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

    res.json({
      success: true,
      jobId: job.id,
      contactCount: sequence.contacts.length,
      stepCount: sequence.steps.length,
    });
  } catch (error) {
    logger.error("Error launching sequence:", error);
    res.status(500).json({ error: "Failed to launch sequence" });
  }
}

export async function pauseSequence(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    // Validate sequence ownership
    const sequence = await prisma.sequence.findUnique({
      where: {
        id,
        userId,
      },
    });

    if (!sequence) {
      return res.status(404).json({ error: "Sequence not found" });
    }

    // Update sequence status
    await prisma.sequence.update({
      where: { id },
      data: { status: "paused" },
    });

    // Stop monitoring
    await monitoringService.stopMonitoring(id);

    res.json({ success: true });
  } catch (error) {
    logger.error("Error pausing sequence:", error);
    res.status(500).json({ error: "Failed to pause sequence" });
  }
}

export async function resumeSequence(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    // Validate sequence ownership
    const sequence = await prisma.sequence.findUnique({
      where: {
        id,
        userId,
      },
    });

    if (!sequence) {
      return res.status(404).json({ error: "Sequence not found" });
    }

    // Update sequence status
    await prisma.sequence.update({
      where: { id },
      data: { status: "active" },
    });

    // Resume monitoring
    await monitoringService.startMonitoring(id);

    res.json({ success: true });
  } catch (error) {
    logger.error("Error resuming sequence:", error);
    res.status(500).json({ error: "Failed to resume sequence" });
  }
}

export async function resetSequenceHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    // Verify sequence ownership
    const sequence = await prisma.sequence.findUnique({
      where: {
        id,
        userId,
      },
    });

    if (!sequence) {
      return res.status(404).json({ error: "Sequence not found" });
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
    await prisma.sequence.update({
      where: { id },
      data: {
        status: "draft",
        testMode: false,
        disableSending: false,
      },
    });
    logger.info(`Sequence status reset to draft`);

    res.json({
      success: true,
      message: "Sequence reset successfully",
    });
  } catch (error) {
    logger.error("Error resetting sequence:", error);
    res.status(500).json({ error: "Failed to reset sequence" });
  }
}
