import Bull from "bull";
import { logger } from "@/services/log/logger";
import { ProcessingJob, EmailJob, JobCounts } from "@mailjot/types";
import type { SequenceProcessor } from "@/services/sequence/sequence-processor";
import type { EmailProcessor } from "@/services/email/email-processor";

export class QueueService {
  // Singleton instance
  private static instance: QueueService | null = null;

  // Queues
  private sequenceQueue: Bull.Queue;
  private emailQueue: Bull.Queue;

  // Processors
  private sequenceProcessor?: SequenceProcessor;
  private emailProcessor?: EmailProcessor;

  // Constructor
  private constructor() {
    logger.info("🔄 Initializing queue service...");

    this.sequenceQueue = this.createQueue("sequence-processing", {
      attempts: 3,
    });

    this.emailQueue = this.createQueue("email-sending", {
      attempts: 2,
    });

    // Add periodic cleanup
    setInterval(() => this.cleanup(), 60 * 60 * 1000); // Run cleanup every hour

    // Set up queue event listeners
    this.setupEventListeners();
    logger.info("✓ Queue service initialized");
  }

  private createQueue(name: string, options: { attempts: number }): Bull.Queue {
    return new Bull(name, {
      redis: {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379"),
        password: process.env.REDIS_PASSWORD,
      },
      prefix: "mailjot",
      defaultJobOptions: {
        attempts: options.attempts,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
        removeOnComplete: {
          age: 24 * 3600,
          count: 1000,
        },
        removeOnFail: {
          age: 24 * 3600,
          count: 1000,
        },
      },
    });
  }

  public static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }

  public setProcessors(
    sequenceProcessor: SequenceProcessor,
    emailProcessor: EmailProcessor
  ) {
    logger.info("🔄 Setting up queue processors...");
    this.sequenceProcessor = sequenceProcessor;
    this.emailProcessor = emailProcessor;
    this.setupProcessors();
    logger.info("✓ Queue processors configured");
  }

  private setupEventListeners() {
    // Add event listeners for job lifecycle
    this.sequenceQueue.on("completed", (job) => {
      logger.info(`✅ Sequence job ${job.id} completed successfully`);
    });

    this.sequenceQueue.on("failed", (job, error) => {
      logger.error(`❌ Sequence job ${job.id} failed:`, error);
    });

    this.sequenceQueue.on("stalled", (job) => {
      logger.warn(`⚠️ Sequence job ${job.id} is stalled`);
    });

    this.emailQueue.on("completed", (job) => {
      logger.info(`✅ Email job ${job.id} completed successfully`);
    });

    this.emailQueue.on("failed", (job, error) => {
      logger.error(`❌ Email job ${job.id} failed:`, error);
    });

    this.emailQueue.on("stalled", (job) => {
      logger.warn(`⚠️ Email job ${job.id} is stalled`);
    });

    // Add more detailed event listeners for email queue
    this.emailQueue.on("waiting", (jobId) => {
      logger.info(`📥 Email job ${jobId} waiting to be processed`);
    });

    this.emailQueue.on("active", (job) => {
      logger.info(`⚡ Email job ${job.id} has started processing`);
    });

    this.emailQueue.on("progress", (job, progress) => {
      logger.info(`📊 Email job ${job.id} progress:`, progress);
    });
  }

  private setupProcessors() {
    if (!this.sequenceProcessor || !this.emailProcessor) {
      throw new Error("Processors not initialized");
    }

    logger.info("🔄 Setting up sequence queue processor...");
    // Process sequence jobs
    this.sequenceQueue.process(async (job) => {
      const processingJob: ProcessingJob = {
        type: "sequence",
        id: job.id.toString(),
        priority: job.opts.priority || 1,
        data: {
          sequenceId: job.data.sequenceId,
          userId: job.data.userId,
          scheduleType: job.data.scheduleType || "custom",
          businessHours: job.data.businessHours,
          testMode: job.data.testMode || false,
        },
      };
      return this.sequenceProcessor!.processSequenceJob(processingJob);
    });

    logger.info("🔄 Setting up email queue processor...");
    // Process email jobs
    this.emailQueue.process(async (job) => {
      const { data } = job;
      logger.info(`📨 Processing email job from queue: ${job.id}`, {
        type: data.type,
        sequenceId: data.sequenceId,
        contactId: data.contactId,
      });

      try {
        const emailJob: EmailJob = {
          id: job.id.toString(),
          type: data.type || "send",
          priority: job.opts.priority || 1,
          data: {
            sequenceId: data.sequenceId,
            contactId: data.contactId,
            stepId: data.stepId,
            userId: data.userId,
            messageId: data.messageId,
            to: data.to,
            subject: data.subject,
            scheduledTime: data.scheduledTime,
            threadId: data.threadId,
            testMode: data.testMode,
          },
        };

        logger.info(
          {
            type: emailJob.type,
            to: emailJob.data.to,
            subject: emailJob.data.subject,
          },
          `📧 Processing email job: ${emailJob.id}`
        );

        switch (emailJob.type) {
          case "send":
            return this.emailProcessor!.processEmail(emailJob);
          case "bounce_check":
            return this.emailProcessor!.checkBounce(emailJob);
          default:
            throw new Error(`Unknown email job type: ${emailJob.type}`);
        }
      } catch (error) {
        logger.error(`❌ Error processing email job: ${job.id}`, error);
        throw error;
      }
    });
    logger.info("✓ Queue processors setup complete");
  }

  // Add a sequence processing job
  async addSequenceJob(job: ProcessingJob): Promise<Bull.Job> {
    logger.info(`📥 Adding sequence job to queue`, {
      sequenceId: job.data.sequenceId,
      userId: job.data.userId,
    });

    const queuedJob = await this.sequenceQueue.add(
      {
        sequenceId: job.data.sequenceId,
        userId: job.data.userId,
        scheduleType: job.data.scheduleType,
        businessHours: job.data.businessHours,
        testMode: job.data.testMode,
      },
      {
        priority: job.priority,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      }
    );

    logger.info(`✓ Sequence job added to queue: ${queuedJob.id}`);
    return queuedJob;
  }

  // Add an email sending job
  async addEmailJob(job: EmailJob): Promise<Bull.Job> {
    logger.info(job, `📥 Adding email job to queue`);

    const { data } = job;

    const emailData: EmailJob["data"] = {
      sequenceId: data.sequenceId,
      contactId: data.contactId,
      stepId: data.stepId,
      userId: data.userId,
      messageId: data.messageId,
      to: data.to,
      subject: data.subject,
      scheduledTime: data.scheduledTime,
      threadId: data.threadId,
      testMode: data.testMode,
    };

    const queuedJob = await this.emailQueue.add(
      {
        type: job.type,
        ...emailData,
      },
      {
        priority: job.priority,
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      }
    );

    logger.info(
      {
        type: job.type,
        to: job.data.to,
      },
      `✓ Email job added to queue: ${queuedJob.id}`
    );
    return queuedJob;
  }

  // Get job counts for monitoring
  async getJobCounts(): Promise<JobCounts> {
    const [sequenceCounts, emailCounts] = await Promise.all([
      this.sequenceQueue.getJobCounts(),
      this.emailQueue.getJobCounts(),
    ]);

    return {
      waiting: sequenceCounts.waiting + emailCounts.waiting,
      active: sequenceCounts.active + emailCounts.active,
      completed: sequenceCounts.completed + emailCounts.completed,
      failed: sequenceCounts.failed + emailCounts.failed,
      delayed: sequenceCounts.delayed + emailCounts.delayed,
    };
  }

  // Get detailed queue status
  async getDetailedQueueStatus(): Promise<{
    sequence: Bull.JobCounts;
    email: Bull.JobCounts;
  }> {
    const [sequenceCounts, emailCounts] = await Promise.all([
      this.sequenceQueue.getJobCounts() as Promise<Bull.JobCounts>,
      this.emailQueue.getJobCounts() as Promise<Bull.JobCounts>,
    ]);

    return {
      sequence: sequenceCounts,
      email: emailCounts,
    };
  }

  // Clean up completed and failed jobs
  async cleanup(age: number = 24 * 60 * 60 * 1000): Promise<void> {
    try {
      logger.info("🧹 Starting queue cleanup...");

      await Promise.all([
        this.sequenceQueue.clean(age, "completed"),
        this.sequenceQueue.clean(age, "failed"),
        this.emailQueue.clean(age, "completed"),
        this.emailQueue.clean(age, "failed"),

        // Also clean waiting jobs older than the age
        this.sequenceQueue.clean(age, "wait"),
        this.emailQueue.clean(age, "wait"),

        // Clean delayed jobs
        this.sequenceQueue.clean(age, "delayed"),
        this.emailQueue.clean(age, "delayed"),

        // Clean active jobs that might be stuck
        this.sequenceQueue.clean(age, "active"),
        this.emailQueue.clean(age, "active"),
      ]);

      // Get all jobs to clean up events
      const sequenceJobs = await this.sequenceQueue.getJobs([
        "completed",
        "failed",
      ]);
      const emailJobs = await this.emailQueue.getJobs(["completed", "failed"]);

      // Keep only the most recent 1000 jobs
      const jobsToRemove = [
        ...sequenceJobs.slice(1000),
        ...emailJobs.slice(1000),
      ];

      // Remove excess jobs
      await Promise.all(jobsToRemove.map((job) => job.remove()));

      logger.info("✓ Queue cleanup completed");
    } catch (error) {
      logger.error("❌ Error during queue cleanup:", error);
    }
  }

  // Add close method for graceful shutdown
  async close(): Promise<void> {
    logger.info("🛑 Closing queue connections...");
    try {
      await Promise.all([this.sequenceQueue.close(), this.emailQueue.close()]);
      logger.info("✓ Queue connections closed");
    } catch (error) {
      logger.error("❌ Error closing queue connections:", error);
      throw error;
    }
  }
}