import { prisma } from "@coldjot/database";
import {
  AlertConfig,
  SequenceHealth,
  SequenceHealthStatusEnum,
  SystemMetrics,
  QueueMetrics,
} from "@coldjot/types";
import { logger } from "@/lib/log";
import { DEFAULT_ALERT_CONFIG } from "@/config";
import os from "os";
import { Queue, QueueEvents } from "bullmq";

/**
 * Phase 6.1: MonitoringService no longer takes the ServiceManager — it only
 * ever used it for `getQueue(name)` to read queue job counts. It now holds the
 * queues map directly. mailops v2: sequence stats access goes through the
 * `prisma` client's `sequenceStats` extension methods directly.
 */
export class MonitoringService {
  private defaultAlertConfig: AlertConfig = DEFAULT_ALERT_CONFIG;
  private queues: Map<string, Queue>;
  private checkIntervals: Map<string, NodeJS.Timeout> = new Map();
  private queueEvents: Map<string, QueueEvents> = new Map();

  constructor(
    queues: Map<string, Queue>
  ) {
    this.queues = queues;
  }

  /** Look up a queue by name (throws if missing). */
  private queue(name: string): Queue {
    const queue = this.queues.get(name);
    if (!queue) {
      throw new Error(`Queue ${name} not initialized`);
    }
    return queue;
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
    const existingStats = await prisma.sequenceStats.getBySequence(sequenceId);

    if (!existingStats) {
      // The monitor initializes a richer row (uniqueOpens, failedEmails, etc.)
      // than createForSequence zeroes — keep the explicit create via prisma for
      // field completeness. Phase 4 folds this into the repo properly.
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
      const stats = await prisma.sequenceStats.getBySequence(sequenceId);

      if (!stats) {
        await this.initializeSequenceStats(sequenceId);
        return {
          sequenceId,
          status: SequenceHealthStatusEnum.HEALTHY,
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
      let status: SequenceHealth["status"] = SequenceHealthStatusEnum.HEALTHY;
      if (errorRate >= config.criticalThreshold) {
        status = SequenceHealthStatusEnum.CRITICAL;
      } else if (errorRate >= config.errorThreshold) {
        status = SequenceHealthStatusEnum.ERROR;
      } else if (errorRate >= config.warningThreshold) {
        status = SequenceHealthStatusEnum.WARNING;
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
      logger.error({ err: error }, `Health check failed for sequence ${sequenceId}`);
      throw error;
    }
  }

  async getSystemMetrics(): Promise<SystemMetrics> {
    const sequenceQueue = this.queue("sequence-processing");
    const emailQueue = this.queue("email-sending");

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
    const sequenceQueue = this.queue("sequence-processing");
    const emailQueue = this.queue("email-sending");

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
