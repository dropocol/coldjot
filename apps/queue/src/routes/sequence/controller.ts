import { Request, Response } from "express";
import { prisma } from "@mailjot/database";
import { QueueService } from "@/services/queue/queue-service";
import { MonitoringService } from "@/services/monitor/monitoring-service";
import { rateLimiter } from "@/services/rate-limit/rate-limiter";
import { resetSequence } from "@/services/sequence/helper";
import { logger } from "@/services/log/logger";
import type { BusinessHours } from "@mailjot/types";
import type { ProcessingJob } from "@mailjot/types";

// Initialize services
const queueService = QueueService.getInstance();
const monitoringService = new MonitoringService(queueService);

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
    const { userId, testMode = false } = req.body;

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
        testMode,
      },
    });

    // Create and schedule the job
    const processingJob: ProcessingJob = {
      type: "sequence",
      id: `sequence-${id}-${Date.now()}`,
      priority: 1,
      data: {
        sequenceId: id,
        userId,
        scheduleType: businessHours ? "business" : "custom",
        businessHours,
        testMode,
      },
    };

    // Add the job to the queue
    const job = await queueService.addSequenceJob(processingJob);

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
    await rateLimiter.resetLimits(userId, id);
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