import { Job, Queue, Worker, WorkerOptions } from "bullmq";
import { logger } from "@/lib/log";
import { STALL_POLICY, JOB_RETRY } from "@/config/queue/policy";

type JobStatus =
  | "waiting"
  | "active"
  | "completed"
  | "failed"
  | "delayed"
  | "paused";

export abstract class BaseProcessor<T = any> {
  protected worker: Worker;
  protected queue: Queue;
  /** "<name>-dl" → Queue. Empty in tests; the composition root passes the real map. */
  protected readonly dlQueues: Map<string, Queue>;

  constructor(
    queue: Queue,
    name: string,
    workerOptions: Partial<WorkerOptions> = {},
    dlQueues: Map<string, Queue> = new Map()
  ) {
    this.queue = queue;
    this.dlQueues = dlQueues;
    this.worker = new Worker(name, this.process.bind(this), {
      ...workerOptions,
      // Stall-detection policy (plan 10). BullMQ defaults leave these unset,
      // so a stalled job is effectively lost. With maxStalledCount: 1 a job
      // that stalls once is moved to failed (and then to the DLQ by onFailed).
      stalledInterval: STALL_POLICY.stalledInterval,
      maxStalledCount: STALL_POLICY.maxStalledCount,
      lockDuration: STALL_POLICY.lockDuration,
      connection: queue.opts.connection,
    });

    // Set up event listeners
    this.worker.on("completed", (job) => {
      if (job) {
        this.onCompleted(job as Job<T>).catch((error) => {
          logger.error({ err: error }, "Error in onCompleted handler");
        });
      }
    });

    this.worker.on("failed", (job, error) => {
      if (job) {
        this.onFailed(job as Job<T>, error).catch((error) => {
          logger.error({ err: error }, "Error in onFailed handler");
        });
      }
    });

    this.worker.on("error", (error) => {
      this.onError(error).catch((error) => {
        logger.error({ err: error }, "Error in onError handler");
      });
    });

    this.worker.on("active", (job) => {
      if (job) {
        this.onActive(job as Job<T>).catch((error) => {
          logger.error({ err: error }, "Error in onActive handler");
        });
      }
    });

    this.worker.on("stalled", (jobId) => {
      this.onStalled(jobId).catch((error) => {
        logger.error({ err: error }, "Error in onStalled handler");
      });
    });
  }

  protected abstract process(job: Job<T>): Promise<void>;

  protected async onCompleted(job: Job<T>): Promise<void> {
    // Log job identity only — job.data may contain recipient/subject PII
    // (EmailJob) or other tenant data. The full payload is retrievable from
    // the BullMQ job store when debugging a specific failure.
    logger.info({
      queue: job.queueName,
      name: job.name,
    }, `🚧 ✅ Job completed: ${job.id}`);
  }

  protected async onFailed(job: Job<T>, error: Error): Promise<void> {
    const attempts = job.opts?.attempts ?? JOB_RETRY.attempts;
    const exhausted = job.attemptsMade >= attempts;

    logger.error({
      queue: job.queueName,
      name: job.name,
      attemptsMade: job.attemptsMade,
      attempts,
      exhausted,
      error: error.message,
    }, `🚧 ❌ Job failed: ${job.id}`);

    // When a job has exhausted its retries, copy it to the paired DLQ for
    // inspection/replay. The original is still subject to BullMQ's
    // removeOnFail retention.
    if (exhausted) {
      try {
        // Phase 6.2: DLQ map is constructor-injected (no more ServiceManager
        // singleton reach). Empty map in tests → no DLQ copy.
        const dlQueue = this.dlQueues.get(`${this.worker.name}-dl`);
        if (dlQueue && dlQueue.name !== this.worker.name) {
          await dlQueue.add(job.name, job.data, { jobId: job.id });
          logger.error({
            queue: job.queueName,
            jobId: job.id,
            dlq: dlQueue.name,
          }, "job moved to DLQ");
        }
      } catch (dlqError) {
        logger.error({ err: dlqError, jobId: job.id }, "failed to move job to DLQ");
      }
    }
  }

  protected async onError(error: Error): Promise<void> {
    logger.error(error, "🚧 ❌ Worker error:");
  }

  protected async onActive(job: Job<T>): Promise<void> {
    logger.info(`🚧 🚀 Job started: ${job.id}`);
  }

  protected async onStalled(jobId: string): Promise<void> {
    // A stalled job means the worker crashed/hung mid-process. With
    // maxStalledCount: 1, BullMQ will move it to failed after this, which in
    // turn routes it to the DLQ via onFailed — so log at error level.
    logger.error({
      queue: this.worker.name,
      jobId,
    }, `🚧 ⚠️ Job stalled: ${jobId}`);
  }

  public async pause(): Promise<void> {
    await this.worker.pause();
    logger.info(`🚧 ⏸️ Worker paused: ${this.worker.name}`);
  }

  public async resume(): Promise<void> {
    await this.worker.resume();
    logger.info(`🚧 ▶️ Worker resumed: ${this.worker.name}`);
  }

  public async close(): Promise<void> {
    await this.worker.close();
    logger.info(`🚧 🛑 Worker closed: ${this.worker.name}`);
  }

  public async getJobCounts(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  }> {
    const counts = await this.queue.getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed",
      "paused"
    );
    return {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
      paused: counts.paused || 0,
    };
  }

  public async removeJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.remove();
      logger.info({
        queue: this.queue.name,
      }, `🚧 🗑️ Job removed: ${jobId}`);
    }
  }

  public async retryJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.retry();
      logger.info({
        queue: this.queue.name,
      }, `🚧 🔄 Job retried: ${jobId}`);
    }
  }

  public async cleanOldJobs(
    gracePeriod: number = 24 * 60 * 60 * 1000
  ): Promise<void> {
    const periodInSeconds = Math.floor(gracePeriod / 1000);
    await this.queue.clean(periodInSeconds, 100, "completed");
    await this.queue.clean(periodInSeconds, 100, "failed");
    logger.info({
      gracePeriod: periodInSeconds,
    }, `🚧 🧹 Cleaned old jobs from queue: ${this.queue.name}`);
  }
}
