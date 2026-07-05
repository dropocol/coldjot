import { Queue, Job } from "bullmq";
import { logger } from "@/lib/log";
import { RedisConnection } from "./shared/redis/connection";
import {
  QUEUE_NAMES,
  QUEUE_OPTIONS,
  DEFAULT_QUEUE_OPTIONS,
  QUEUE_PREFIX,
  type QueueName,
} from "@/config";
import { JOB_DEFAULTS } from "@/config/queue/policy";

// Core services
import { MemoryMonitor } from "./core/memory/monitor";
import { RateLimitService } from "./core/rate-limit/service";
import { JobManager } from "./jobs/job-manager";

// Import processors directly
import { BaseProcessor } from "./jobs/base-processor";
import { SequenceProcessor } from "./jobs/sequence/processor";
import { EmailProcessor } from "./jobs/email/processor";
import { ContactProcessor } from "./jobs/contact/processor";
import { ScheduleProcessor } from "./jobs/schedule/processor";
import { ListSyncProcessor } from "./jobs/list/processor";
import { WatchCleanupService } from "./watch/cleanup";
import { PubSubService } from "./pubsub/client";

type ProcessorType = BaseProcessor<any>;

export class ServiceManager {
  private static instance: ServiceManager;
  private redisConnection: RedisConnection;
  private memoryMonitor: MemoryMonitor | null = null;
  private rateLimitService: RateLimitService | null = null;
  private jobManager: JobManager | null = null;
  private queues: Map<string, Queue>;
  private dlQueues: Map<string, Queue>;
  private processors: Map<string, ProcessorType>;
  private watchCleanupService: WatchCleanupService;
  private pubSubService: PubSubService;

  private constructor() {
    this.redisConnection = RedisConnection.getInstance();
    this.queues = new Map();
    this.dlQueues = new Map();
    this.processors = new Map();
    this.watchCleanupService = new WatchCleanupService();
    this.pubSubService = PubSubService.getInstance();
  }

  public static getInstance(): ServiceManager {
    if (!ServiceManager.instance) {
      ServiceManager.instance = new ServiceManager();
    }
    return ServiceManager.instance;
  }

  public async initialize(): Promise<void> {
    try {
      logger.info("🚀 Initializing Service Manager...");

      // Initialize core services
      await this.initializeCoreServices();

      // Initialize queues
      await this.initializeQueues();

      // Initialize processors
      await this.initializeProcessors();

      // Start watch cleanup service
      await this.watchCleanupService.start();

      logger.info("✨ Service Manager initialized successfully");
    } catch (error) {
      logger.error({ err: error }, "❌ Error initializing Service Manager");
      throw error;
    }
  }

  private async initializeCoreServices(): Promise<void> {
    try {
      logger.info("🔧 Initializing core services...");

      // Initialize memory monitor
      this.memoryMonitor = MemoryMonitor.getInstance();
      await this.memoryMonitor.startMonitoring();

      // Initialize rate limit service
      this.rateLimitService = RateLimitService.getInstance();
      logger.info("⚡ Rate limit service initialized");

      // Initialize PubSub service
      await this.pubSubService.initialize();
      await this.pubSubService.startListening();
      logger.info("📨 PubSub service initialized and listening");
    } catch (error) {
      logger.error({ err: error }, "❌ Error initializing core services");
      throw error;
    }
  }

  private async initializeQueues(): Promise<void> {
    try {
      logger.info("📦 Initializing queues...");

      // Create queues for each queue name
      const queueEntries = Object.entries(QUEUE_NAMES) as [QueueName, string][];

      for (const [queueKey, queueName] of queueEntries) {
        const queue = this.createQueue(queueKey, queueName);
        this.queues.set(queueName, queue);
        logger.info(`📬 Queue initialized: ${queueName}`);
      }

      // Create a paired dead-letter queue for each queue so jobs that exhaust
      // their retries can be copied aside for inspection/replay. DLQs are the
      // "<name>-dl" BullMQ queues surfaced in Bull-Board. (Use "-" not ":" —
      // BullMQ rejects ":" in queue names.)
      for (const [queueKey, queueName] of queueEntries) {
        const dlName = `${queueName}-dl`;
        const dlQueue = this.createQueue(queueKey, dlName, true);
        this.dlQueues.set(dlName, dlQueue);
        logger.info(`📬 DLQ initialized: ${dlName}`);
      }

      logger.info(`✅ Initialized ${queueEntries.length} queues`);

      // Phase 6.1: JobManager now holds the queues map directly (instead of a
      // back-reference to ServiceManager). It must be constructed AFTER the
      // queues are populated.
      this.jobManager = new JobManager(this.queues);
    } catch (error) {
      logger.error({ err: error }, "❌ Error initializing queues");
      throw error;
    }
  }

  private createQueue(
    queueKey: QueueName,
    queueName: string,
    isDlq = false
  ): Queue {
    try {
      // Get queue-specific options or use defaults
      const queueConfig = {
        ...DEFAULT_QUEUE_OPTIONS,
        ...(QUEUE_OPTIONS[queueKey] || {}),
        // DLQs keep jobs indefinitely-ish; never re-run them automatically.
        ...(isDlq
          ? {
              defaultJobOptions: {
                ...JOB_DEFAULTS,
                attempts: 1,
                backoff: undefined,
              },
            }
          : {}),
        // These settings should override any other configurations
        connection: this.redisConnection.getClient(),
        prefix: QUEUE_PREFIX.slice(0, -1), // Remove trailing colon as BullMQ adds it
      };

      return new Queue(queueName, queueConfig);
    } catch (error) {
      logger.error(error, `❌ Error creating queue ${queueName}:`);
      throw error;
    }
  }

  private async initializeProcessors(): Promise<void> {
    try {
      logger.info("⚙️ Initializing processors...");

      // Phase 6.2/6.3: processors take their deps via constructor — DLQ map
      // (BaseProcessor.onFailed) + JobManager (the 3 that enqueue follow-up
      // jobs). No more ServiceManager.getInstance() inside processors.
      const dlQueues = this.dlQueues;
      const jobManager = this.jobManager;
      const processorMap: Record<string, (queue: Queue) => ProcessorType> = {
        [QUEUE_NAMES.SEQUENCE]: (queue: Queue) => new SequenceProcessor(queue, jobManager!, dlQueues),
        [QUEUE_NAMES.EMAIL]: (queue: Queue) => new EmailProcessor(queue, dlQueues),
        // [QUEUE_NAMES.THREAD_WATCHER]: (queue: Queue) =>
        //   new ThreadProcessor(queue),
        [QUEUE_NAMES.CONTACT]: (queue: Queue) => new ContactProcessor(queue, jobManager!, dlQueues),
        [QUEUE_NAMES.EMAIL_SCHEDULE]: (queue: Queue) =>
          new ScheduleProcessor(queue, jobManager!, dlQueues),
        [QUEUE_NAMES.LIST_SYNC]: (queue: Queue) => new ListSyncProcessor(queue, dlQueues),
      };

      for (const [queueName, createProcessor] of Object.entries(processorMap)) {
        const queue = this.queues.get(queueName);
        if (!queue) {
          logger.warn(`⚠️ No queue found for processor: ${queueName}`);
          continue;
        }

        try {
          const processor = createProcessor(queue);
          this.processors.set(queueName, processor);
          logger.info(`⚙️ Processor initialized: ${queueName}`);
        } catch (error) {
          logger.error(
            error,
            `❌ Failed to initialize processor: ${queueName}`
          );
        }
      }

      const successCount = this.processors.size;
      logger.info(
        `✅ Initialized ${successCount}/${Object.keys(processorMap).length} processors successfully`
      );
    } catch (error) {
      logger.error({ err: error }, "❌ Error initializing processors");
      throw error;
    }
  }

  public getQueue(name: string): Queue | undefined {
    return this.queues.get(name);
  }

  /**
   * All primary queues as a Map — Phase 6.1 bridge so JobManager and
   * MonitoringService can be constructed with the queues they need (instead of
   * a ServiceManager back-reference). Removed in 6.4 when createApp() owns this.
   */
  public getQueues(): Map<string, Queue> {
    return this.queues;
  }

  /**
   * Get the paired dead-letter queue for a queue name (e.g. for "email-sending"
   * returns the "email-sending-dl" queue). Used by BaseProcessor when a job
   * exhausts its retries.
   */
  public getDlQueue(queueName: string): Queue | undefined {
    return this.dlQueues.get(`${queueName}-dl`);
  }

  /** All DLQ queues — used by Bull-Board. */
  public getAllDlQueues(): Queue[] {
    return Array.from(this.dlQueues.values());
  }

  /** All primary queues — used by Bull-Board. */
  public getAllQueues(): Queue[] {
    return Array.from(this.queues.values());
  }

  public getProcessor(name: string): ProcessorType | undefined {
    return this.processors.get(name);
  }

  public async shutdown(): Promise<void> {
    try {
      logger.info("🛑 Shutting down Service Manager...");

      // Stop PubSub service
      await this.pubSubService.stopListening();
      logger.info("📨 PubSub service stopped");

      // Stop memory monitor
      if (this.memoryMonitor) {
        await this.memoryMonitor.stopMonitoring();
        logger.info("📊 Memory monitor stopped");
      }

      // Close all processors (which will close their workers)
      for (const [name, processor] of this.processors.entries()) {
        await processor.close();
        logger.info(`⚙️ Processor closed: ${name}`);
      }

      // Close all queues
      for (const [name, queue] of this.queues.entries()) {
        await queue.close();
        logger.info(`📬 Queue closed: ${name}`);
      }

      // Close all DLQs
      for (const [name, queue] of this.dlQueues.entries()) {
        await queue.close();
        logger.info(`📬 DLQ closed: ${name}`);
      }

      // Close Redis connection
      await this.redisConnection.close();
      logger.info("🔌 Redis connection closed");

      // Stop watch cleanup service
      await this.watchCleanupService.stop();
      logger.info("📊 Watch cleanup service stopped");

      logger.info("✨ Service Manager shutdown complete");
    } catch (error) {
      logger.error({ err: error }, "❌ Error during shutdown");
      throw error;
    }
  }

  /**
   * Get the job manager instance
   */
  public getJobManager(): JobManager {
    if (!this.jobManager) {
      throw new Error(
        "JobManager not initialized — call initialize() before getJobManager()."
      );
    }
    return this.jobManager;
  }
}

// TODO: Remove this if possible
// Export factory function
export const createServiceManager = (): ServiceManager => {
  return ServiceManager.getInstance();
};
