import { Queue, Job } from "bullmq";
import { logger } from "@/lib/log";
import { QUEUE_NAMES } from "@/config";
import { JOB_RETRY, JOB_DEFAULTS } from "@/config/queue/policy";
import type { ProcessingJob, EmailJob } from "@coldjot/types";

/**
 * Phase 6.1: JobManager no longer takes the ServiceManager — it only ever used
 * it for `getQueue(name)`. It now holds the queues map directly, so the queues
 * must be created BEFORE the JobManager is constructed (the composition root
 * handles this; ServiceManager was already implicitly ordered that way because
 * `initialize()` runs before any job add).
 */
export class JobManager {
  constructor(private readonly queues: Map<string, Queue>) {}

  /** Look up a queue by name (throws if missing). */
  private queue(name: string): Queue {
    const queue = this.queues.get(name);
    if (!queue) {
      throw new Error(`Queue ${name} not initialized`);
    }
    return queue;
  }

  /**
   * Add a sequence processing job to the queue
   */
  public async addSequenceJob(job: ProcessingJob): Promise<Job> {
    logger.info(`Adding sequence job to queue`);
    return await this.queue(QUEUE_NAMES.SEQUENCE).add(QUEUE_NAMES.SEQUENCE, job, {
      ...JOB_DEFAULTS,
      attempts: JOB_RETRY.attempts,
      backoff: JOB_RETRY.backoff,
    });
  }

  /**
   * Add an email job to the queue
   */
  public async addEmailJob(job: EmailJob): Promise<Job> {
    logger.info("Adding email job to queue");

    logger.info("Adding email job to queue");

    // Calculate delay if scheduledTime exists
    let delay: number | undefined;
    if (job.scheduledTime) {
      const scheduledTime = new Date(job.scheduledTime);
      const now = new Date();
      delay = Math.max(0, scheduledTime.getTime() - now.getTime());
      logger.info(
        {
          delayMs: delay,
          delayMin: (delay / (1000 * 60)).toFixed(2),
          sequenceId: job.sequenceId,
          contactId: job.contactId,
          // Intentionally not logging `to`/`subject` — PII.
        },
        "⏰ Email job scheduled"
      );
    }

    return await this.queue(QUEUE_NAMES.EMAIL).add(QUEUE_NAMES.EMAIL, job, {
      delay,
      ...JOB_DEFAULTS,
      attempts: JOB_RETRY.attempts,
      backoff: JOB_RETRY.backoff,
    });
  }

  /**
   * Get job counts for a specific queue
   */
  public async getJobCounts(queueName: string) {
    return await this.queue(queueName).getJobCounts();
  }

  /**
   * Get a specific job from a queue
   */
  public async getJob(
    queueName: string,
    jobId: string
  ): Promise<Job | undefined> {
    return await this.queue(queueName).getJob(jobId);
  }

  /**
   * Remove a job from a queue
   */
  public async removeJob(queueName: string, jobId: string): Promise<void> {
    const queue = this.queue(queueName);
    const job = await queue.getJob(jobId);
    if (job) {
      await job.remove();
      logger.info(`Removed job ${jobId} from queue ${queueName}`);
    }
  }
}
