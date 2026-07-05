import { Queue, Job } from "bullmq";
import { BaseProcessor } from "../base-processor";
import { logger } from "@/lib/log";
import { PrismaSequenceContactRepository } from "@/repositories/prisma/prisma-sequence-contact.repo";
import { PrismaSequenceStepRepository } from "@/repositories/prisma/prisma-sequence-step.repo";
import { JobManager } from "@/services/jobs/job-manager";
import {
  RunScheduleServiceImpl,
  type RunScheduleService,
} from "@/services/domain/run-schedule.service";

import { EMAIL_SCHEDULER_CONFIG } from "@/config";
import { QUEUE_NAMES } from "@/config";
import { getWorkerOptions } from "@/config";

/**
 * Phase 7.2b: ScheduleProcessor is now a thin BullMQ wrapper. All schedule-tick
 * domain logic (find due contacts → rate-limit → resolve step → build EmailJob
 * → enqueue → advance progress → bounded-retry) lives in `RunScheduleServiceImpl`.
 * `process()` just delegates to `service.tick()`.
 *
 * The constructor keeps the BullMQ topology setup (the repeating job scheduler)
 * and the dev helpers (checkNextScheduledEmail / advanceToNextEmail), which are
 * BullMQ/dev affordances rather than domain logic.
 */
export class ScheduleProcessor extends BaseProcessor<any> {
  private checkInterval: number = EMAIL_SCHEDULER_CONFIG.CHECK_INTERVAL;
  private retryDelay: number = EMAIL_SCHEDULER_CONFIG.RETRY_DELAY;
  private readonly SCHEDULER_ID = "email-sending-scheduler";

  private readonly jobManager: JobManager;
  private readonly sequenceContact = new PrismaSequenceContactRepository();
  private readonly service: RunScheduleService;

  constructor(
    queue: Queue,
    jobManager: JobManager,
    dlQueues: Map<string, Queue> = new Map(),
    service?: RunScheduleService
  ) {
    super(
      queue,
      QUEUE_NAMES.EMAIL_SCHEDULE,
      getWorkerOptions(QUEUE_NAMES.EMAIL_SCHEDULE),
      dlQueues
    );
    this.jobManager = jobManager;
    // Default to a real RunScheduleServiceImpl so `new ScheduleProcessor(q, jm)`
    // (the Group D characterization test) works. The composition root passes
    // its own instance.
    this.service =
      service ??
      new RunScheduleServiceImpl(
        this.sequenceContact,
        new PrismaSequenceStepRepository(),
        this.jobManager
      );

    logger.info(
      {
        checkInterval: this.checkInterval,
        retryDelay: this.retryDelay,
      },
      "📧 Email Scheduling Processor initialized"
    );

    this.setupEmailSendingScheduler();
  }

  /**
   * Set up the job scheduler for periodic email checking.
   */
  private async setupEmailSendingScheduler(): Promise<void> {
    try {
      // Create a job scheduler that runs every checkInterval milliseconds
      await this.queue.upsertJobScheduler(
        this.SCHEDULER_ID,
        { every: this.checkInterval },
        {
          name: "check-scheduled-emails",
          opts: {
            removeOnComplete: true,
            removeOnFail: true,
          },
        }
      );
      logger.info(
        `📅 Email scheduling scheduler initialized with ${this.checkInterval}ms interval`
      );
    } catch (error) {
      logger.error({ err: error }, "❌ Failed to setup email scheduling scheduler");
      throw error;
    }
  }

  protected async process(job: Job<any>): Promise<void> {
    try {
      await this.service.tick();
    } catch (error) {
      logger.error({ err: error }, `Failed to process schedule job ${job.id}`);
      throw error;
    }
  }

  // Development helper methods ------------------------------------------------

  public async checkNextScheduledEmail(): Promise<{
    nextEmail?: {
      id: string;
      scheduledTime: Date | null;
      contact: string;
      step: number;
    };
    currentTime: Date;
  }> {
    if (process.env.APP_ENV !== "development") {
      logger.warn(
        "⚠️ checkNextScheduledEmail is only available in development mode"
      );
      return { currentTime: new Date() };
    }

    const nextEmail = await this.sequenceContact.peekNextScheduled();

    if (!nextEmail) {
      logger.info("📭 No scheduled emails found");
      return { currentTime: new Date() };
    }

    logger.info(
      {
        id: nextEmail.id,
        scheduledTime: nextEmail.scheduledTime?.toISOString(),
        contact: nextEmail.email,
        step: nextEmail.step,
        timeUntilSend: nextEmail.scheduledTime
          ? `${Math.round(
              (nextEmail.scheduledTime.getTime() - Date.now()) / 1000 / 60
            )} minutes`
          : "unknown",
      },
      "📧 Next scheduled email"
    );

    return {
      nextEmail: nextEmail
        ? {
            id: nextEmail.id,
            scheduledTime: nextEmail.scheduledTime,
            contact: nextEmail.email,
            step: nextEmail.step,
          }
        : undefined,
      currentTime: new Date(),
    };
  }

  public async advanceToNextEmail(): Promise<void> {
    if (process.env.APP_ENV !== "development") {
      logger.warn(
        "⚠️ advanceToNextEmail is only available in development mode"
      );
      return;
    }

    const { nextEmail } = await this.checkNextScheduledEmail();

    if (nextEmail?.scheduledTime) {
      // Add 1 second to ensure we're past the scheduled time
      const targetTime = new Date(nextEmail.scheduledTime.getTime() + 1000);

      logger.info(
        {
          from: new Date().toISOString(),
          to: targetTime.toISOString(),
          emailId: nextEmail.id,
          contact: nextEmail.contact,
        },
        "⏰ Advancing time to process next email"
      );

      // Trigger immediate check
      await this.service.tick();
    } else {
      logger.info("📭 No emails to advance to");
    }
  }
}
