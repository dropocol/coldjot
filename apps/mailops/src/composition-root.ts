/**
 * Phase 1 composition root — the ONE place concrete implementations are wired
 * to their interfaces.
 *
 * IMPORTANT (Phase 1): `server.ts` does NOT call `createApp()` yet. This file
 * exists only so Phases 2–6 have somewhere to migrate *to*. It is exercised
 * solely by `__tests__/wiring.test.ts`. Production boots exactly as it did in
 * Phase 0.
 *
 * Phase 4 swaps the existing-class adapters for new impls that take their
 * dependencies via constructor injection. 4a replaced TrackingService; 4b
 * replaced EmailService with SendEmailServiceImpl (Gmail-API only — SMTP
 * path deleted). PubSubHandler is still the legacy class until 4c.
 */

// Infra singletons (kept as process-wide singletons — locked decision).
import { RedisConnection } from "@/services/shared/redis/connection";
import { MemoryMonitor } from "@/services/core/memory/monitor";
import { RateLimitService } from "@/services/core/rate-limit/service";
import { PubSubService } from "@/services/pubsub/client";
import { WatchCleanupService } from "@/services/watch/cleanup";
import { JobManager } from "@/services/jobs/job-manager";
import { ServiceManager } from "@/services/service-manager";

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

// Domain service interfaces
import type { SendEmailService } from "@/services/domain/send-email.service";
import type { TrackingService } from "@/services/domain/tracking.service";
import type { InboxSyncService } from "@/services/domain/inbox-sync.service";
import type { LaunchSequenceService } from "@/services/domain/launch-sequence.service";
import type { RunScheduleService } from "@/services/domain/run-schedule.service";

// Existing classes (Phase 4 replaces these behind the domain interfaces)
import { TrackingService as TrackingServiceImpl } from "@/lib/tracking";
import { PubSubHandler } from "@/services/pubsub/handler";
import {
  SendEmailServiceImpl,
} from "@/services/domain/send-email.service";
import { GmailTransport } from "@/adapters/gmail-transport";

// ---------------------------------------------------------------------------
// Clock — trivial default impl
// ---------------------------------------------------------------------------

const systemClock: Clock = { now: () => new Date() };

// ---------------------------------------------------------------------------
// App graph
// ---------------------------------------------------------------------------

export interface App {
  // Infra singletons (lazily started by ServiceManager.initialize()).
  redis: RedisConnection;
  memoryMonitor: MemoryMonitor;
  rateLimit: RateLimitService;
  pubsub: PubSubService;
  watchCleanup: WatchCleanupService;
  jobManager: JobManager;
  serviceManager: ServiceManager;
  clock: Clock;

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

  // Domain services (Phase 4 swaps the impls behind these contracts)
  sendEmail: SendEmailService;
  tracking: TrackingService;
  inboxSync: InboxSyncService;
  launchSequence: LaunchSequenceService;
  runSchedule: RunScheduleService;
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
  // Per the locked decision: these remain process-wide singletons. Phase 1
  // references them through their existing getInstance() accessors (Phase 6
  // removes the ServiceManager wrapper and these singletons). They are NOT
  // started here — only ServiceManager.initialize() boots Redis/PubSub/etc.,
  // and createApp() does not call it.
  const redis = RedisConnection.getInstance();
  const memoryMonitor = MemoryMonitor.getInstance();
  const rateLimit = RateLimitService.getInstance();
  const pubsub = PubSubService.getInstance();
  const watchCleanup = new WatchCleanupService();
  const serviceManager = ServiceManager.getInstance();
  const jobManager = serviceManager.getJobManager();

  // ---- Domain services ---------------------------------------------------
  // Phase 4b: SendEmailServiceImpl replaces the EmailService class — same
  // behavior (Gmail-API path only; SMTP branch deleted). TrackingService +
  // PubSubHandler still wrap the existing classes until 4c.
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

  const pubsubHandler = new PubSubHandler();
  const inboxSync: InboxSyncService = {
    handleNotification: (message) => pubsubHandler.handleNotification(message),
  };

  // launchSequence + runSchedule are placeholders until Phase 2 (controllers)
  // and Phase 4 (god-object split) land. They throw if called before then —
  // production code still calls the route handlers / ScheduleProcessor directly.
  const notYetWired = (name: string): never => {
    throw new Error(
      `composition-root: ${name} is not wired until Phase 2/4. Production should still call the existing route/processor directly.`
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

  return {
    redis,
    memoryMonitor,
    rateLimit,
    pubsub,
    watchCleanup,
    jobManager,
    serviceManager,
    clock: systemClock,
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
  };
}
