import { Request, Response } from "express";
import { logger } from "@/lib/log";
import Redis from "ioredis";
import { ServiceManager } from "@/services/service-manager";
import { MonitoringService } from "@/services/monitor/service";

// TODO : recheck this file
// Initialize services
const serviceManager = ServiceManager.getInstance();
const monitoringService = new MonitoringService(serviceManager);
const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD,
});

export async function checkHealthSimple(req: Request, res: Response) {
  res.status(200).json({ message: "OK" });
}

export async function checkHealth(req: Request, res: Response) {
  try {
    // Check Redis connection
    const redisStatus = await redis.ping();

    // Get queues from service manager
    const sequenceQueue = serviceManager.getQueue("sequence-processing");
    const emailQueue = serviceManager.getQueue("email-sending");

    if (!sequenceQueue || !emailQueue) {
      throw new Error("Required queues not initialized");
    }

    // Get queue status
    const [sequenceJobCounts, emailJobCounts] = await Promise.all([
      sequenceQueue.getJobCounts(),
      emailQueue.getJobCounts(),
    ]);

    const queueStatus = {
      sequence: sequenceJobCounts,
      email: emailJobCounts,
    };

    // Get queue metrics
    const metrics = await monitoringService.getSystemMetrics();

    res.json({
      status: "ok",
      redis: redisStatus === "PONG" ? "connected" : "error",
      queues: {
        sequence: queueStatus.sequence,
        email: queueStatus.email,
      },
      metrics,
    });
  } catch (error) {
    logger.error({ err: error }, "Health check failed");
    res.status(500).json({
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function getQueueStatus(req: Request, res: Response) {
  try {
    // Get queues from service manager
    const sequenceQueue = serviceManager.getQueue("sequence-processing");
    const emailQueue = serviceManager.getQueue("email-sending");

    if (!sequenceQueue || !emailQueue) {
      throw new Error("Required queues not initialized");
    }

    // Get detailed status
    const [sequenceJobCounts, emailJobCounts] = await Promise.all([
      sequenceQueue.getJobCounts(),
      emailQueue.getJobCounts(),
    ]);

    const detailedStatus = {
      sequence: sequenceJobCounts,
      email: emailJobCounts,
    };

    // Get total job counts
    const jobCounts = {
      waiting: sequenceJobCounts.waiting + emailJobCounts.waiting,
      active: sequenceJobCounts.active + emailJobCounts.active,
      completed: sequenceJobCounts.completed + emailJobCounts.completed,
      failed: sequenceJobCounts.failed + emailJobCounts.failed,
      delayed: sequenceJobCounts.delayed + emailJobCounts.delayed,
    };

    res.json({
      sequence: {
        ...detailedStatus.sequence,
        isProcessing: detailedStatus.sequence.active > 0,
      },
      email: {
        ...detailedStatus.email,
        isProcessing: detailedStatus.email.active > 0,
      },
      total: jobCounts,
    });
  } catch (error) {
    logger.error({ err: error }, "Error getting queue status");
    res.status(500).json({ error: "Failed to get queue status" });
  }
}
