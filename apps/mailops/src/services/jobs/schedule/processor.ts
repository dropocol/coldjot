import { Queue, Job } from "bullmq";
import { BaseProcessor } from "../base-processor";
import { logger } from "@/lib/log";
import { prisma } from "@coldjot/database";
import { randomUUID } from "crypto";
import { rateLimitService } from "@/services/core/rate-limit/service";
import { scheduleGenerator } from "@/lib/schedule";

import {
  StepStatus,
  type StepType,
  StepTypeEnum,
  StepPriority,
  StepTiming,
  type EmailJob,
  type Sequence,
  type SequenceStep,
  type BusinessHours,
  EmailJobEnum,
  SequenceContactStatusEnum,
  SequenceStatus,
  BusinessScheduleEnum,
} from "@coldjot/types";
import { EMAIL_SCHEDULER_CONFIG } from "@/config";
import { QUEUE_NAMES } from "@/config";
import { getWorkerOptions } from "@/config";
import {
  SCHEDULE_MAX_FAILURES,
  SCHEDULE_FAILURE_BACKOFF_MS,
} from "@/config/queue/policy";
import { ServiceManager } from "@/services/service-manager";
import { updateSequenceContactStatus } from "../sequence/helper";
import { PrismaSequenceContactRepository } from "@/repositories/prisma/prisma-sequence-contact.repo";
// Define the type for what we actually need from the sequence
type SequenceWithRelations = {
  id: string;
  userId: string;
  steps: SequenceStep[];
  businessHours?: BusinessHours;
  testMode: boolean;
  disableSending: boolean;
  sequenceMailboxId: string;
};

// TODO : Create proper types
// Define our email processing type
interface SequenceContactWithRelations {
  id: string;
  sequenceId: string;
  contactId: string;
  currentStep: number;
  lastProcessedAt: Date | null;
  nextScheduledAt: Date | null;
  completed: boolean;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  failureCount: number;
  sequence: SequenceWithRelations;
  contact: {
    id: string;
    email: string;
  };
}

export class ScheduleProcessor extends BaseProcessor<any> {
  private checkInterval: number = EMAIL_SCHEDULER_CONFIG.CHECK_INTERVAL;
  private retryDelay: number = EMAIL_SCHEDULER_CONFIG.RETRY_DELAY;
  private readonly SCHEDULER_ID = "email-sending-scheduler";

  private serviceManager = ServiceManager.getInstance();
  private jobManager = this.serviceManager.getJobManager();
  private readonly sequenceContact = new PrismaSequenceContactRepository();

  constructor(queue: Queue) {
    super(
      queue,
      QUEUE_NAMES.EMAIL_SCHEDULE,
      getWorkerOptions(QUEUE_NAMES.EMAIL_SCHEDULE)
    );

    logger.info({
      checkInterval: this.checkInterval,
      retryDelay: this.retryDelay,
    }, "📧 Email Scheduling Processor initialized");

    this.setupEmailSendingScheduler();
  }

  /**
   * Set up the job scheduler for periodic email checking
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
      await this.processScheduledEmails();
    } catch (error) {
      logger.error({ err: error }, `Failed to process schedule job ${job.id}`);
      throw error;
    }
  }

  /**
   * Process emails that are due to be sent
   */
  private async processScheduledEmails(): Promise<void> {
    try {
      logger.info({
        timestamp: new Date().toISOString(),
      }, "🔍 Checking for scheduled emails to process");
      //
      // Find emails that are due to be sent with the correct structure
      const dueEmails = await this.sequenceContact.findDueContacts(new Date());

      // Development mode: Log scheduled times for debugging
      const isDevelopment =
        process.env.APP_ENV === "development" ? true : false;
      if (isDevelopment) {
        logger.debug(
          {
            currentTime: new Date().toISOString(),
            scheduledEmails: dueEmails.map((email) => ({
              id: email.id,
              nextScheduledAt: email.nextScheduledAt?.toISOString(),
              email: email.contact.email,
              stepIndex: email.currentStep,
            })),
          },
          "🔧 Development mode: Scheduled emails"
        );
      }

      logger.info(`📥 Found ${dueEmails.length} emails to process`);

      // Process each email
      for (const email of dueEmails) {
        try {
          // Add the required status field to each step. The repository already
          // flattens sequenceMailbox → sequenceMailboxId and attaches the
          // BusinessScheduleEnum type to businessHours.
          const emailWithStatus: SequenceContactWithRelations = {
            ...email,
            sequence: {
              ...email.sequence,
              steps: email.sequence.steps.map((step) => ({
                ...step,
                status: StepStatus.ACTIVE,
                stepType: step.stepType as StepType,
                timing: step.timing as StepTiming,
              })) as any,
            },
          };

          await this.processEmail(emailWithStatus);
        } catch (error) {
          logger.error(
            {
              id: email.id,
              sequenceId: email.sequenceId,
              contactId: email.contactId,
              email: email.contact.email,
              error: error instanceof Error ? error.message : "Unknown error",
              stack: error instanceof Error ? error.stack : undefined,
            },
            "❌ Error processing email"
          );
          // Continue with next email even if one fails
          continue;
        }
      }

      logger.info({
        processedCount: dueEmails.length,
        timestamp: new Date().toISOString(),
      }, "✅ Completed processing batch of scheduled emails");
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      }, "❌ Error in processScheduledEmails");
      throw error;
    }
  }

  /**
   * Process an individual email
   */
  private async processEmail(
    email: SequenceContactWithRelations
  ): Promise<void> {
    const { sequence, contact } = email;

    logger.info(
      {
        id: email.id,
        sequenceId: sequence.id,
        contactId: contact.id,
        email: contact.email,
        currentStep: email.currentStep,
        totalSteps: sequence.steps.length,
      },
      "📧 Processing email"
    );

    try {
      // 1. Check rate limits
      logger.debug(
        `🔍 Checking rate limits for email user: ${sequence.userId} | sequence: ${sequence.id} | contact: ${contact.id}`
      );

      const { allowed } = await rateLimitService.checkRateLimit(
        sequence.userId,
        sequence.id,
        contact.id
      );

      if (!allowed) {
        logger.warn({
          userId: sequence.userId,
          sequenceId: sequence.id,
          contactId: contact.id,
        }, "⚠️ Rate limit exceeded");
        return;
      }

      // 2. Get current step
      const currentStepIndex = email.currentStep - 1;
      const currentStep = sequence.steps[currentStepIndex] as
        | SequenceStep
        | undefined;

      if (!currentStep) {
        logger.error(
          {
            sequenceId: sequence.id,
            currentStep: email.currentStep,
            totalSteps: sequence.steps.length,
          },
          `❌ Step not found for sequence: ${sequence.id} | currentStep: ${email.currentStep} with total steps: ${sequence.steps.length}`
        );

        // Verify if the step still exists in the database
        const stepExists = await prisma.sequenceStep.findFirst({
          where: {
            sequenceId: sequence.id,
            order: email.currentStep,
          },
        });

        if (!stepExists) {
          logger.info(
            {
              sequenceId: sequence.id,
              currentStep: email.currentStep,
            },
            "🗑️ Step has been deleted, cleaning up"
          );

          // If this was the last step, mark the sequence as completed
          // if (email.currentStep >= sequence.steps.length) {
          //   await prisma.sequenceContact.update({
          //     where: { id: email.id },
          //     data: {
          //       completed: true,
          //       completedAt: new Date(),
          //       nextScheduledAt: null,
          //     },
          //   });
          //   logger.info(
          //     "✅ Marked sequence as completed due to deleted last step"
          //   );
          // } else {
          //   // Skip to the next step
          //   await prisma.sequenceContact.update({
          //     where: { id: email.id },
          //     data: {
          //       currentStep: email.currentStep + 1,
          //       nextScheduledAt: new Date(), // Schedule immediately
          //     },
          //   });
          //   logger.info("⏭️ Skipped deleted step, moving to next step");
          // }
          return;
        }

        throw new Error("Step not found");
      }

      logger.debug({
        stepId: currentStep.id,
        stepType: currentStep.stepType,
        timing: currentStep.timing,
        order: currentStep.order,
      }, "📋 Current step details");

      // 3. Calculate next send time using scheduling service
      logger.debug({
        currentTime: new Date().toISOString(),
        hasBusinessHours: !!sequence.businessHours,
        businessHours: sequence.businessHours,
      }, "🕒 Calculating next send time");

      const nextSendTime = await scheduleGenerator.calculateNextRun(
        new Date(),
        currentStep,
        sequence.businessHours
      );

      if (!nextSendTime) {
        logger.error({
          stepId: currentStep.id,
          timing: currentStep.timing,
          businessHours: sequence.businessHours,
        }, "❌ Could not calculate next send time");
        throw new Error("Could not calculate next send time");
      }

      // Log compact identifiers only — businessHours/currentStep may be verbose
      // and currentStep carries subject/content (PII).
      logger.info(
        { hasBusinessHours: !!sequence.businessHours, stepOrder: currentStep.order, nextSendTime },
        "🕒 Schedule decision"
      );

      logger.debug({
        nextSendTime: nextSendTime.toISOString(),
        delay: nextSendTime.getTime() - Date.now(),
      }, "⏰ Next send time calculated");

      const previousStepIndex = currentStep.order - 1;
      const previousSubject = sequence.steps[previousStepIndex]?.subject || "";

      // TODO : This should be handled in the email processor for better accuracy
      // const subject = currentStep.replyToThread
      //   ? `Re: ${previousSubject}`
      //   : currentStep.subject;

      // Get threadId from SequenceContact if it exists
      const sequenceContactThreadId = await this.sequenceContact.findThreadId(
        sequence.id,
        contact.id
      );
      const sequenceContact = sequenceContactThreadId
        ? { threadId: sequenceContactThreadId }
        : null;

      // Log thread details for debugging
      logger.info(
        {
          sequenceId: sequence.id,
          contactId: contact.id,
          currentStep: email.currentStep,
          stepId: currentStep.id,
          replyToThread: currentStep.replyToThread,
          existingThreadId: sequenceContact?.threadId,
          willUseThreadId: currentStep.replyToThread
            ? sequenceContact?.threadId
            : undefined,
          // subject,
          previousSubject,
          stepOrder: currentStep.order,
        },
        "🧵 Thread details for email creation"
      );

      if (currentStep.replyToThread && !sequenceContact?.threadId) {
        logger.warn(
          {
            stepId: currentStep.id,
            sequenceId: sequence.id,
            contactId: contact.id,
          },
          "⚠️ Reply to thread was requested but no thread ID found"
        );
      }

      // 4. Create email job
      const emailJob: EmailJob = {
        sequenceId: sequence.id,
        contactId: contact.id,
        stepId: currentStep.id,
        userId: sequence.userId,
        sequenceMailboxId: sequence.sequenceMailboxId,
        to: contact.email,
        // subject: subject || currentStep.subject || "",
        threadId:
          currentStep.replyToThread && sequenceContact?.threadId
            ? sequenceContact.threadId
            : undefined,
        scheduledTime: nextSendTime.toISOString(),
        disableSending: sequence.disableSending,
        testMode: sequence.testMode,
      };

      logger.info("📧 Created email job with thread details");

      // 5. Add to queue
      logger.debug(
        {
          scheduledTime: emailJob.scheduledTime,
        },
        "📤 Adding email job to queue"
      );

      // Add a check in EmailThread model to see if the threadId is fake
      // if it is, do not create the job

      // const thread = await prisma.emailThread.findUnique({
      //   where: {
      //     threadId: emailJob.threadId,
      //   },
      // });

      // if (thread?.isFake) {
      //   await this.jobManager.addEmailJob(emailJob);
      // } else {
      //   logger.info("🚫 Skipping email job due to no threadId");
      // }

      await this.jobManager.addEmailJob(emailJob);
      logger.info(
        {
          scheduledTime: nextSendTime.toISOString(),
          to: contact.email,
          sequenceId: sequence.id,
          stepId: currentStep.id,
        },
        "📧 Created email job"
      );

      // 6. Update sequence progress
      const isLastStep = email.currentStep >= sequence.steps.length;
      logger.debug(
        {
          id: email.id,
          currentStep: email.currentStep,
          isLastStep,
          nextScheduledAt: isLastStep ? null : nextSendTime,
        },
        "📝 Updating sequence progress"
      );

      await updateSequenceContactStatus(
        sequence.id,
        contact.id,
        SequenceContactStatusEnum.SCHEDULED,
        {
          lastProcessedAt: new Date(),
        }
      );

      // 8. Increment rate limit counters
      logger.debug("🔄 Incrementing rate limit counters");

      await rateLimitService.incrementCounters(
        sequence.userId,
        sequence.id,
        contact.id
      );

      logger.info(
        {
          id: email.id,
          sequenceId: sequence.id,
          contactId: contact.id,
          email: contact.email,
          nextStep: email.currentStep,
          isComplete: isLastStep,
        },
        "✅ Successfully processed email"
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(
        {
          id: email.id,
          sequenceId: sequence.id,
          contactId: contact.id,
          email: contact.email,
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        },
        "❌ Error processing email"
      );

      // Bounded retry for the schedule path. This processor sends emails inline
      // (not via the EMAIL queue), so BullMQ attempts don't apply here — we
      // track failures on the SequenceContact row itself. Once a contact hits
      // SCHEDULE_MAX_FAILURES it's marked "failed" and removed from the poller's
      // query (nextScheduledAt = null) so it surfaces in the UI instead of
      // looping forever (plan 10).
      const nextFailureCount = (email.failureCount ?? 0) + 1;
      const exhausted = nextFailureCount >= SCHEDULE_MAX_FAILURES;
      // Truncate stored error so a huge stacktrace can't bloat the row.
      const truncatedError = errorMessage.slice(0, 1000);

      if (exhausted) {
        await this.sequenceContact.updateById(email.id, {
          failureCount: nextFailureCount,
          lastError: truncatedError,
          status: SequenceContactStatusEnum.FAILED,
          nextScheduledAt: null,
        });
        logger.error(
          {
            sequenceId: sequence.id,
            contactId: contact.id,
            failureCount: nextFailureCount,
          },
          "contact marked failed after max schedule retries"
        );
      } else {
        const nextRetry = new Date(Date.now() + SCHEDULE_FAILURE_BACKOFF_MS);
        logger.debug(
          {
            id: email.id,
            failureCount: nextFailureCount,
            nextRetry: nextRetry.toISOString(),
          },
          "🔄 Scheduling bounded retry"
        );
        await this.sequenceContact.updateById(email.id, {
          failureCount: nextFailureCount,
          lastError: truncatedError,
          nextScheduledAt: nextRetry,
        });
      }

      // Re-throw so the poller job itself is visible as failed in BullMQ.
      // The repeating scheduler continues to fire on its interval regardless.
      throw error;
    }
  }

  // Development helper methods
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

    logger.info({
      id: nextEmail.id,
      scheduledTime: nextEmail.scheduledTime?.toISOString(),
      contact: nextEmail.email,
      step: nextEmail.step,
      timeUntilSend: nextEmail.scheduledTime
        ? `${Math.round(
            (nextEmail.scheduledTime.getTime() - Date.now()) / 1000 / 60
          )} minutes`
        : "unknown",
    }, "📧 Next scheduled email");

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

      logger.info({
        from: new Date().toISOString(),
        to: targetTime.toISOString(),
        emailId: nextEmail.id,
        contact: nextEmail.contact,
      }, "⏰ Advancing time to process next email");

      // Use scheduling service to advance time
      // TODO : implement this
      // rateLimitService.advanceTimeTo(targetTime);

      // Trigger immediate check
      await this.processScheduledEmails();
    } else {
      logger.info("📭 No emails to advance to");
    }
  }
}

// TODO : export singleton instance
