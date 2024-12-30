import { prisma } from "@mailjot/database";
import {
  AlertConfig,
  SequenceHealth,
  SystemMetrics,
  QueueMetrics,
} from "@mailjot/types";
import { logger } from "@/lib/log";
import { ServiceManager } from "@/services/service-manager";
import { DEFAULT_ALERT_CONFIG } from "@/config";
import os from "os";
import { Queue, QueueEvents } from "bullmq";

export class MonitoringService {
  private defaultAlertConfig: AlertConfig = DEFAULT_ALERT_CONFIG;
  private serviceManager: ServiceManager;
  private checkIntervals: Map<string, NodeJS.Timeout> = new Map();
  private queueEvents: Map<string, QueueEvents> = new Map();

  constructor(serviceManager: ServiceManager) {
    this.serviceManager = serviceManager;
  }

  async startMonitoring(
    sequenceId: string,
    config?: Partial<AlertConfig>
  ): Promise<void> {
    const alertConfig = { ...this.defaultAlertConfig, ...config };

    // Stop existing monitoring if any
    this.stopMonitoring(sequenceId);

    // Initialize sequence stats if they don't exist
    await this.initializeSequenceStats(sequenceId);

    // Start health check interval
    const interval = setInterval(
      () => this.checkSequenceHealth(sequenceId, alertConfig),
      alertConfig.checkInterval
    );

    this.checkIntervals.set(sequenceId, interval);
    logger.info(`Started monitoring sequence ${sequenceId}`);
  }

  stopMonitoring(sequenceId: string): void {
    const interval = this.checkIntervals.get(sequenceId);
    if (interval) {
      clearInterval(interval);
      this.checkIntervals.delete(sequenceId);
      logger.info(`Stopped monitoring sequence ${sequenceId}`);
    }

    // Clean up queue events
    const events = this.queueEvents.get(sequenceId);
    if (events) {
      events.close();
      this.queueEvents.delete(sequenceId);
    }
  }

  private async initializeSequenceStats(sequenceId: string): Promise<void> {
    const existingStats = await prisma.sequenceStats.findFirst({
      where: { sequenceId },
    });

    if (!existingStats) {
      await prisma.sequenceStats.create({
        data: {
          sequenceId,
          totalEmails: 0,
          sentEmails: 0,
          openedEmails: 0,
          uniqueOpens: 0,
          clickedEmails: 0,
          repliedEmails: 0,
          bouncedEmails: 0,
          failedEmails: 0,
          unsubscribed: 0,
          interested: 0,
          peopleContacted: 0,
          openRate: 0,
          clickRate: 0,
          replyRate: 0,
          bounceRate: 0,
        },
      });
      logger.info(`Initialized stats for sequence ${sequenceId}`);
    }
  }

  async checkSequenceHealth(
    sequenceId: string,
    config: AlertConfig
  ): Promise<SequenceHealth> {
    try {
      // Get sequence stats
      const stats = await prisma.sequenceStats.findFirst({
        where: { sequenceId },
      });

      if (!stats) {
        await this.initializeSequenceStats(sequenceId);
        return {
          sequenceId,
          status: "healthy",
          errorCount: 0,
          lastCheck: new Date(),
          metrics: {
            deliveryRate: 1,
            bounceRate: 0,
            errorRate: 0,
            processingTime: 0,
          },
        };
      }

      // Get queue metrics
      const queueMetrics = await this.getQueueMetrics(sequenceId);

      // Calculate health metrics
      const sentEmails = stats.sentEmails || 0;
      const bouncedEmails = stats.bouncedEmails || 0;
      const failedEmails = stats.failedEmails || 0;

      const deliveryRate =
        sentEmails > 0 ? (sentEmails - bouncedEmails) / sentEmails : 1;
      const bounceRate = sentEmails > 0 ? bouncedEmails / sentEmails : 0;
      const errorRate = queueMetrics.errorRate;

      // Determine health status
      let status: SequenceHealth["status"] = "healthy";
      if (errorRate >= config.criticalThreshold) {
        status = "critical";
      } else if (errorRate >= config.errorThreshold) {
        status = "error";
      } else if (errorRate >= config.warningThreshold) {
        status = "warning";
      }

      const health: SequenceHealth = {
        sequenceId,
        status,
        errorCount: failedEmails,
        lastCheck: new Date(),
        metrics: {
          deliveryRate,
          bounceRate,
          errorRate,
          processingTime: queueMetrics.avgProcessingTime,
        },
      };

      await this.storeHealthCheck(health);
      return health;
    } catch (error) {
      logger.error(`Health check failed for sequence ${sequenceId}:`, error);
      throw error;
    }
  }

  async getSystemMetrics(): Promise<SystemMetrics> {
    const sequenceQueue = this.serviceManager.getQueue("sequence-processing");
    const emailQueue = this.serviceManager.getQueue("email-sending");

    if (!sequenceQueue || !emailQueue) {
      throw new Error("Required queues not initialized");
    }

    const [sequenceJobCounts, emailJobCounts] = await Promise.all([
      sequenceQueue.getJobCounts(),
      emailQueue.getJobCounts(),
    ]);

    const queueMetrics = await this.getQueueMetrics();

    return {
      queueSize:
        sequenceJobCounts.waiting +
        sequenceJobCounts.active +
        (emailJobCounts.waiting + emailJobCounts.active),
      processingRate: queueMetrics.processingRate,
      errorRate: queueMetrics.errorRate,
      cpuUsage: os.loadavg()[0], // 1 minute load average
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
      activeWorkers: sequenceJobCounts.active + emailJobCounts.active,
      jobsCompleted: sequenceJobCounts.completed + emailJobCounts.completed,
      jobsFailed: sequenceJobCounts.failed + emailJobCounts.failed,
    };
  }

  private async getQueueMetrics(sequenceId?: string): Promise<QueueMetrics> {
    const sequenceQueue = this.serviceManager.getQueue("sequence-processing");
    const emailQueue = this.serviceManager.getQueue("email-sending");

    if (!sequenceQueue || !emailQueue) {
      throw new Error("Required queues not initialized");
    }

    const [sequenceCounts, emailCounts] = await Promise.all([
      sequenceQueue.getJobCounts(),
      emailQueue.getJobCounts(),
    ]);

    const totalJobs = sequenceCounts.completed + emailCounts.completed;

    if (totalJobs === 0) {
      return {
        processingRate: 0,
        errorRate: 0,
        avgProcessingTime: 0,
        throughput: 0,
      };
    }

    const failedJobs = sequenceCounts.failed + emailCounts.failed;
    const errorRate = failedJobs / totalJobs;

    const processingRate = sequenceCounts.active + emailCounts.active;
    const throughput = totalJobs;

    return {
      processingRate: processingRate / 60, // jobs per second
      errorRate,
      avgProcessingTime: 0, // Not available without detailed job info
      throughput,
    };
  }

  private async storeHealthCheck(health: SequenceHealth): Promise<void> {
    await prisma.sequenceHealth.upsert({
      where: {
        sequenceId: health.sequenceId,
      },
      create: {
        sequenceId: health.sequenceId,
        status: health.status,
        errorCount: health.errorCount,
        lastCheck: health.lastCheck,
        lastError: health.lastError,
        metrics: health.metrics as any, // Prisma will handle JSON serialization
      },
      update: {
        status: health.status,
        errorCount: health.errorCount,
        lastCheck: health.lastCheck,
        lastError: health.lastError,
        metrics: health.metrics as any,
      },
    });
  }
}
