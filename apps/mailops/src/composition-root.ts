/**
 * Composition root — the ONE place concrete implementations are wired to
 * their interfaces.
 *
 * Phase 6: this file owns the full app graph (infra singletons + queues +
 * processors + repos + domain services + controllers). `server.ts` calls
 * `createApp()` once, then `initializeApp(app)` to boot the infra, and
 * `shutdownApp(app)` on SIGTERM/SIGINT. Nothing else reaches for a global
 * singleton — `ServiceManager` is gone.
 *
 * Build order matters: queues must exist before JobManager / processors /
 * MonitoringService; repos must exist before domain services; domain services
 * must exist before processors + controllers.
 */

import { Queue } from "bullmq";
import Redis, { type Redis as RedisClient } from "ioredis";

// Infra singletons (kept as process-wide singletons — locked decision).
import { RedisConnection } from "@/services/shared/redis/connection";
import { MemoryMonitor } from "@/services/core/memory/monitor";
import { RateLimitService } from "@/services/core/rate-limit/service";
import { PubSubService } from "@/services/pubsub/client";
import { WatchCleanupService } from "@/services/watch/cleanup";

// Jobs infrastructure
import { JobManager } from "@/services/jobs/job-manager";
import { BaseProcessor } from "@/services/jobs/base-processor";
import { SequenceProcessor } from "@/services/jobs/sequence/processor";
import { EmailProcessor } from "@/services/jobs/email/processor";
import { ContactProcessor } from "@/services/jobs/contact/processor";
import { ScheduleProcessor } from "@/services/jobs/schedule/processor";
import { ListSyncProcessor } from "@/services/jobs/list/processor";
import { MonitoringService } from "@/services/monitor/service";

// Queue config
import {
  QUEUE_NAMES,
  QUEUE_OPTIONS,
  DEFAULT_QUEUE_OPTIONS,
  QUEUE_PREFIX,
  type QueueName,
} from "@/config";
import { JOB_DEFAULTS } from "@/config/queue/policy";

// Adapter interfaces
import type { Clock } from "@/adapters/clock";

// Repository interfaces + Prisma impls
import type { EmailTrackingRepository } from "@/repositories/email-tracking.repo";
import type { EmailEventRepository } from "@/repositories/email-event.repo";
import type { SequenceContactRepository } from "@/repositories/sequence-contact.repo";
import type { SequenceRepository } from "@/repositories/sequence.repo";
import type { SequenceStepRepository } from "@/repositories/sequence-step.repo";
import type { SequenceStatsRepository } from "@/repositories/sequence-stats.repo";
import type { MailboxRepository } from "@/repositories/mailbox.repo";
import type { TrackedLinkRepository } from "@/repositories/tracked-link.repo";
import type { LinkClickRepository } from "@/repositories/link-click.repo";
import type { EmailThreadRepository } from "@/repositories/email-thread.repo";
import type { EmailWatchRepository } from "@/repositories/email-watch.repo";
import type { EmailWatchHistoryRepository } from "@/repositories/email-watch-history.repo";
import type { ProcessedMessageRepository } from "@/repositories/processed-message.repo";
import type { BusinessHoursRepository } from "@/repositories/business-hours.repo";
import type { TemplateRepository } from "@/repositories/template.repo";
import type { ContactRepository } from "@/repositories/contact.repo";
import type { ListSyncRecordRepository } from "@/repositories/list-sync-record.repo";
import type { ListRepository } from "@/repositories/list.repo";

import { PrismaEmailTrackingRepository } from "@/repositories/prisma/prisma-email-tracking.repo";
import { PrismaEmailEventRepository } from "@/repositories/prisma/prisma-email-event.repo";
import { PrismaSequenceContactRepository } from "@/repositories/prisma/prisma-sequence-contact.repo";
import { PrismaSequenceRepository } from "@/repositories/prisma/prisma-sequence.repo";
import { PrismaSequenceStepRepository } from "@/repositories/prisma/prisma-sequence-step.repo";
import { PrismaSequenceStatsRepository } from "@/repositories/prisma/prisma-sequence-stats.repo";
import { PrismaMailboxRepository } from "@/repositories/prisma/prisma-mailbox.repo";
import { PrismaTrackedLinkRepository } from "@/repositories/prisma/prisma-tracked-link.repo";
import { PrismaLinkClickRepository } from "@/repositories/prisma/prisma-link-click.repo";
import { PrismaEmailThreadRepository } from "@/repositories/prisma/prisma-email-thread.repo";
import { PrismaEmailWatchRepository } from "@/repositories/prisma/prisma-email-watch.repo";
import { PrismaEmailWatchHistoryRepository } from "@/repositories/prisma/prisma-email-watch-history.repo";
import { PrismaProcessedMessageRepository } from "@/repositories/prisma/prisma-processed-message.repo";
import { PrismaBusinessHoursRepository } from "@/repositories/prisma/prisma-business-hours.repo";
import { PrismaTemplateRepository } from "@/repositories/prisma/prisma-template.repo";
import { PrismaContactRepository } from "@/repositories/prisma/prisma-contact.repo";
import { PrismaListSyncRecordRepository } from "@/repositories/prisma/prisma-list-sync-record.repo";
import { PrismaListRepository } from "@/repositories/prisma/prisma-list.repo";

// Domain service interfaces + impls
import type { SendEmailService } from "@/services/domain/send-email.service";
import type { TrackingService } from "@/services/domain/tracking.service";
import type { InboxSyncService } from "@/services/domain/inbox-sync.service";
import type { LaunchSequenceService } from "@/services/domain/launch-sequence.service";
import type { RunScheduleService } from "@/services/domain/run-schedule.service";

import { TrackingService as TrackingServiceImpl } from "@/lib/tracking";
import { SendEmailServiceImpl } from "@/services/domain/send-email.service";
import { InboxSyncServiceImpl } from "@/services/domain/inbox-sync.service";
import { GmailTransport } from "@/adapters/gmail-transport";

// Controller factories
import {
  createSequenceController,
} from "@/controllers/sequence.controller";
import { createHealthController } from "@/controllers/health.controller";
import { createMetricsController } from "@/controllers/metrics.controller";
import { createMailboxController } from "@/controllers/mailbox.controller";
import { createListController } from "@/controllers/list.controller";
import { WatchService } from "@/services/watch";

import { logger } from "@/lib/log";

type ProcessorType = BaseProcessor<any>;

// ---- helpers (moved verbatim from the deleted service-manager.ts) ---------

function createQueue(
  redisClient: RedisClient,
  queueKey: QueueName,
  queueName: string,
  isDlq = false
): Queue {
  const queueConfig = {
    ...DEFAULT_QUEUE_OPTIONS,
    ...(QUEUE_OPTIONS[queueKey] || {}),
    ...(isDlq
      ? {
          defaultJobOptions: {
            ...JOB_DEFAULTS,
            attempts: 1,
            backoff: undefined,
          },
        }
      : {}),
    connection: redisClient,
    prefix: QUEUE_PREFIX.slice(0, -1), // Remove trailing colon; BullMQ adds it.
  };
  return new Queue(queueName, queueConfig);
}

/** Build the primary queues + their paired `*-dl` DLQs (moved from SM). */
function buildQueues(redisClient: RedisClient): {
  queues: Map<string, Queue>;
  dlQueues: Map<string, Queue>;
} {
  const queues = new Map<string, Queue>();
  const dlQueues = new Map<string, Queue>();
  const queueEntries = Object.entries(QUEUE_NAMES) as [QueueName, string][];

  for (const [queueKey, queueName] of queueEntries) {
    queues.set(queueName, createQueue(redisClient, queueKey, queueName));
    const dlName = `${queueName}-dl`;
    dlQueues.set(dlName, createQueue(redisClient, queueKey, dlName, true));
  }
  return { queues, dlQueues };
}

// ---- App graph -----------------------------------------------------------

const systemClock: Clock = { now: () => new Date() };

export interface App {
  // Infra singletons (started by initializeApp()).
  redis: RedisConnection;
  redisClient: RedisClient;
  memoryMonitor: MemoryMonitor;
  rateLimit: RateLimitService;
  pubsub: PubSubService;
  watchCleanup: WatchCleanupService;
  clock: Clock;

  // Jobs infrastructure
  queues: Map<string, Queue>;
  dlQueues: Map<string, Queue>;
  jobManager: JobManager;
  processors: Map<string, ProcessorType>;
  monitoring: MonitoringService;

  // Repositories
  emailTracking: EmailTrackingRepository;
  emailEvent: EmailEventRepository;
  sequenceContact: SequenceContactRepository;
  sequence: SequenceRepository;
  sequenceStep: SequenceStepRepository;
  sequenceStats: SequenceStatsRepository;
  mailbox: MailboxRepository;
  trackedLink: TrackedLinkRepository;
  linkClick: LinkClickRepository;
  emailThread: EmailThreadRepository;
  emailWatch: EmailWatchRepository;
  emailWatchHistory: EmailWatchHistoryRepository;
  processedMessage: ProcessedMessageRepository;
  businessHours: BusinessHoursRepository;
  template: TemplateRepository;
  contact: ContactRepository;
  listSyncRecord: ListSyncRecordRepository;
  list: ListRepository;

  // Domain services
  sendEmail: SendEmailService;
  tracking: TrackingService;
  inboxSync: InboxSyncService;
  launchSequence: LaunchSequenceService;
  runSchedule: RunScheduleService;

  // Controllers
  sequenceController: ReturnType<typeof createSequenceController>;
  healthController: ReturnType<typeof createHealthController>;
  metricsController: ReturnType<typeof createMetricsController>;
  mailboxController: ReturnType<typeof createMailboxController>;
  listController: ReturnType<typeof createListController>;
}

export function createApp(): App {
  // ---- Repositories (stateless; safe to construct eagerly) ---------------
  const emailTracking = new PrismaEmailTrackingRepository();
  const emailEvent = new PrismaEmailEventRepository();
  const sequenceContact = new PrismaSequenceContactRepository();
  const sequence = new PrismaSequenceRepository();
  const sequenceStep = new PrismaSequenceStepRepository();
  const sequenceStats = new PrismaSequenceStatsRepository();
  const mailbox = new PrismaMailboxRepository();
  const trackedLink = new PrismaTrackedLinkRepository();
  const linkClick = new PrismaLinkClickRepository();
  const emailThread = new PrismaEmailThreadRepository();
  const emailWatch = new PrismaEmailWatchRepository();
  const emailWatchHistory = new PrismaEmailWatchHistoryRepository();
  const processedMessage = new PrismaProcessedMessageRepository();
  const businessHours = new PrismaBusinessHoursRepository();
  const template = new PrismaTemplateRepository();
  const contact = new PrismaContactRepository();
  const listSyncRecord = new PrismaListSyncRecordRepository();
  const list = new PrismaListRepository();

  // ---- Infra singletons (constructed; NOT started) ----------------------
  const redis = RedisConnection.getInstance();
  const redisClient = redis.getClient();
  const memoryMonitor = MemoryMonitor.getInstance();
  const rateLimit = RateLimitService.getInstance();
  const pubsub = PubSubService.getInstance();
  const watchCleanup = new WatchCleanupService();

  // ---- Queues + DLQs -----------------------------------------------------
  const { queues, dlQueues } = buildQueues(redisClient);

  // ---- JobManager + MonitoringService (need the queues map) --------------
  const jobManager = new JobManager(queues);
  const monitoring = new MonitoringService(queues, sequenceStats);

  // ---- Domain services ---------------------------------------------------
  const sendEmail: SendEmailService = new SendEmailServiceImpl(
    new GmailTransport(),
    emailTracking,
    trackedLink
  );

  const trackingImpl = new TrackingServiceImpl();
  const tracking: TrackingService = {
    createTracking: (metadata) => trackingImpl.createTracking(metadata),
    handleEmailOpen: (hash) => trackingImpl.handleEmailOpen(hash),
    handleLinkClick: (hash, linkId) => trackingImpl.handleLinkClick(hash, linkId),
    trackEmailEvent: (input) => trackingImpl.trackEmailEvent(input),
  };

  const inboxSync: InboxSyncService = new InboxSyncServiceImpl(
    mailbox,
    emailWatch,
    emailWatchHistory,
    processedMessage,
    emailThread,
    sequenceContact,
    emailEvent
  );

  // launchSequence + runSchedule remain placeholders — production calls the
  // route handlers / ScheduleProcessor directly. Phase 7 fills these in.
  const notYetWired = (name: string): never => {
    throw new Error(
      `composition-root: ${name} is not wired yet. Production should still call the existing route/processor directly.`
    );
  };
  const launchSequence: LaunchSequenceService = {
    launch: async () => notYetWired("launchSequence.launch"),
    pause: async () => notYetWired("launchSequence.pause"),
    resume: async () => notYetWired("launchSequence.resume"),
    reset: async () => notYetWired("launchSequence.reset"),
  };
  const runSchedule: RunScheduleService = {
    tick: async () => notYetWired("runSchedule.tick"),
  };

  // ---- Processors (need queues + DLQs + jobManager + services + repos) ---
  const processors = new Map<string, ProcessorType>();
  const processorSpecs: Array<[string, () => ProcessorType]> = [
    [QUEUE_NAMES.SEQUENCE, () => new SequenceProcessor(queues.get(QUEUE_NAMES.SEQUENCE)!, jobManager, dlQueues)],
    [QUEUE_NAMES.EMAIL, () => new EmailProcessor(queues.get(QUEUE_NAMES.EMAIL)!, dlQueues)],
    [QUEUE_NAMES.CONTACT, () => new ContactProcessor(queues.get(QUEUE_NAMES.CONTACT)!, jobManager, dlQueues)],
    [QUEUE_NAMES.EMAIL_SCHEDULE, () => new ScheduleProcessor(queues.get(QUEUE_NAMES.EMAIL_SCHEDULE)!, jobManager, dlQueues)],
    [QUEUE_NAMES.LIST_SYNC, () => new ListSyncProcessor(queues.get(QUEUE_NAMES.LIST_SYNC)!, dlQueues)],
  ];
  for (const [name, make] of processorSpecs) {
    processors.set(name, make());
  }

  // ---- Controllers (need jobManager + monitoring + repos + services) -----
  const watchService = new WatchService();
  const sequenceController = createSequenceController({
    jobManager,
    monitoringService: monitoring,
    sequenceRepo: sequence,
    businessHoursRepo: businessHours,
    rateLimitService: rateLimit,
  });
  const healthController = createHealthController({
    redis: redisClient,
    queues,
    monitoringService: monitoring,
  });
  const metricsController = createMetricsController({ monitoringService: monitoring });
  const mailboxController = createMailboxController({
    watchService,
    mailboxRepo: mailbox,
  });
  const listController = createListController({ listSyncRecordRepo: listSyncRecord });

  return {
    redis,
    redisClient,
    memoryMonitor,
    rateLimit,
    pubsub,
    watchCleanup,
    clock: systemClock,
    queues,
    dlQueues,
    jobManager,
    processors,
    monitoring,
    emailTracking,
    emailEvent,
    sequenceContact,
    sequence,
    sequenceStep,
    sequenceStats,
    mailbox,
    trackedLink,
    linkClick,
    emailThread,
    emailWatch,
    emailWatchHistory,
    processedMessage,
    businessHours,
    template,
    contact,
    listSyncRecord,
    list,
    sendEmail,
    tracking,
    inboxSync,
    launchSequence,
    runSchedule,
    sequenceController,
    healthController,
    metricsController,
    mailboxController,
    listController,
  };
}

// ---- Lifecycle (moved from ServiceManager.initialize / shutdown) ----------

/**
 * Boot the infra singletons: memory monitor, PubSub (listening for Gmail
 * notifications → forwards to inboxSync), watch cleanup. Processors start
 * their BullMQ workers on construction in createApp(); nothing extra here.
 */
export async function initializeApp(app: App): Promise<void> {
  logger.info("🚀 Initializing app...");

  await app.memoryMonitor.startMonitoring();
  logger.info("📊 Memory monitor started");

  await app.pubsub.initialize();
  await app.pubsub.startListening();
  logger.info("📨 PubSub service initialized and listening");

  await app.watchCleanup.start();
  logger.info("🧹 Watch cleanup service started");

  logger.info("✨ App initialized successfully");
}

/**
 * Graceful shutdown — same order as the former ServiceManager.shutdown():
 * PubSub → memory monitor → processors → queues → DLQs → Redis → watch cleanup.
 */
export async function shutdownApp(app: App): Promise<void> {
  try {
    logger.info("🛑 Shutting down app...");

    await app.pubsub.stopListening();
    logger.info("📨 PubSub service stopped");

    await app.memoryMonitor.stopMonitoring();
    logger.info("📊 Memory monitor stopped");

    for (const [name, processor] of app.processors.entries()) {
      await processor.close();
      logger.info(`⚙️ Processor closed: ${name}`);
    }

    for (const [name, queue] of app.queues.entries()) {
      await queue.close();
      logger.info(`📬 Queue closed: ${name}`);
    }

    for (const [name, queue] of app.dlQueues.entries()) {
      await queue.close();
      logger.info(`📬 DLQ closed: ${name}`);
    }

    await app.redis.close();
    logger.info("🔌 Redis connection closed");

    await app.watchCleanup.stop();
    logger.info("📊 Watch cleanup service stopped");

    logger.info("✨ App shutdown complete");
  } catch (error) {
    logger.error({ err: error }, "❌ Error during shutdown");
    throw error;
  }
}
