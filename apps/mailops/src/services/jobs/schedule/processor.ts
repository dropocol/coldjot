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
} from "@coldjot/types";
import { EMAIL_SCHEDULER_CONFIG } from "@/config";
import { QUEUE_NAMES } from "@/config";
import { getWorkerOptions } from "@/config";
import { ServiceManager } from "@/services/service-manager";
import { updateSequenceContactStatus } from "../sequence/helper";
// Define the type for what we actually need from the sequence
type SequenceWithRelations = {
  id: string;
  userId: string;
  steps: SequenceStep[];
  businessHours: BusinessHours | null;
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

  constructor(queue: Queue) {
    super(
      queue,
      QUEUE_NAMES.EMAIL_SCHEDULE,
      getWorkerOptions(QUEUE_NAMES.EMAIL_SCHEDULE)
    );

    logger.info("📧 Email Scheduling Processor initialized", {
      checkInterval: this.checkInterval,
      retryDelay: this.retryDelay,
    });

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
      logger.error("❌ Failed to setup email scheduling scheduler:", error);
      throw error;
    }
  }

  protected async process(job: Job<any>): Promise<void> {
    try {
      await this.processScheduledEmails();
    } catch (error) {
      logger.error(`Failed to process schedule job ${job.id}:`, error);
      throw error;
    }
  }

  /**
   * Process emails that are due to be sent
   */
  private async processScheduledEmails(): Promise<void> {
    try {
      logger.info("🔍 Checking for scheduled emails to process", {
        timestamp: new Date().toISOString(),
      });
      //
      // Find emails that are due to be sent with the correct structure
      const dueEmails = await prisma.sequenceContact.findMany({
        where: {
          AND: [
            {
              nextScheduledAt: {
                lte: new Date(),
                not: null,
              },
            },
            {
              AND: [
                { completed: false },
                { status: SequenceContactStatusEnum.IN_PROGRESS },
                {
                  sequence: {
                    status: SequenceStatus.ACTIVE,
                  },
                },
              ],
            },
          ],
        },
        select: {
          id: true,
          sequenceId: true,
          contactId: true,
          currentStep: true,
          lastProcessedAt: true,
          nextScheduledAt: true,
          completed: true,
          completedAt: true,
          createdAt: true,
          updatedAt: true,
          sequence: {
            select: {
              id: true,
              userId: true,
              status: true,
              testMode: true,
              disableSending: true,
              sequenceMailbox: true,
              steps: {
                orderBy: {
                  order: "asc",
                },
                select: {
                  id: true,
                  sequenceId: true,
                  stepType: true,
                  priority: true,
                  timing: true,
                  delayAmount: true,
                  delayUnit: true,
                  subject: true,
                  content: true,
                  includeSignature: true,
                  note: true,
                  order: true,
                  previousStepId: true,
                  replyToThread: true,
                  createdAt: true,
                  updatedAt: true,
                  templateId: true,
                },
              },
              businessHours: {
                select: {
                  timezone: true,
                  workDays: true,
                  workHoursStart: true,
                  workHoursEnd: true,
                  holidays: true,
                },
              },
            },
          },
          contact: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

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
          // Add the required status field to each step
          const emailWithStatus: SequenceContactWithRelations = {
            ...email,
            sequence: {
              ...email.sequence,
              sequenceMailboxId: email.sequence.sequenceMailbox!.id,
              steps: email.sequence.steps.map((step) => ({
                ...step,
                status: StepStatus.ACTIVE,
                stepType: step.stepType as StepType,
                priority: step.priority as StepPriority,
                timing: step.timing as StepTiming,
              })),
            },
          };

          await this.processEmail(emailWithStatus);
        } catch (error) {
          logger.error("❌ Error processing email", {
            id: email.id,
            sequenceId: email.sequenceId,
            contactId: email.contactId,
            email: email.contact.email,
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
          });
          // Continue with next email even if one fails
          continue;
        }
      }

      logger.info("✅ Completed processing batch of scheduled emails", {
        processedCount: dueEmails.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("❌ Error in processScheduledEmails:", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });
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
        logger.warn("⚠️ Rate limit exceeded", {
          userId: sequence.userId,
          sequenceId: sequence.id,
          contactId: contact.id,
        });
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

      logger.debug("📋 Current step details", {
        stepId: currentStep.id,
        stepType: currentStep.stepType,
        timing: currentStep.timing,
        order: currentStep.order,
      });

      // 3. Calculate next send time using scheduling service
      logger.debug("🕒 Calculating next send time", {
        currentTime: new Date().toISOString(),
        hasBusinessHours: !!sequence.businessHours,
        businessHours: sequence.businessHours,
      });

      const nextSendTime = await scheduleGenerator.calculateNextRun(
        new Date(),
        currentStep,
        sequence.businessHours || undefined
      );

      if (!nextSendTime) {
        logger.error("❌ Could not calculate next send time", {
          stepId: currentStep.id,
          timing: currentStep.timing,
          businessHours: sequence.businessHours,
        });
        throw new Error("Could not calculate next send time");
      }

      logger.debug("⏰ Next send time calculated", {
        nextSendTime: nextSendTime.toISOString(),
        delay: nextSendTime.getTime() - Date.now(),
      });

      const previousStepIndex = currentStep.order - 1;
      const previousSubject = sequence.steps[previousStepIndex]?.subject || "";

      const subject = currentStep.replyToThread
        ? `Re: ${previousSubject}`
        : currentStep.subject;

      // Get threadId from SequenceContact if it exists
      const sequenceContact = await prisma.sequenceContact.findUnique({
        where: {
          sequenceId_contactId: {
            sequenceId: sequence.id,
            contactId: contact.id,
          },
        },
        select: {
          threadId: true,
        },
      });

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
          subject,
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
        subject: subject || currentStep.subject || "",
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

      const thread = await prisma.emailThread.findUnique({
        where: {
          threadId: emailJob.threadId,
        },
      });

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
      logger.error(
        {
          id: email.id,
          sequenceId: sequence.id,
          contactId: contact.id,
          email: contact.email,
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "❌ Error processing email"
      );

      // Schedule retry
      logger.debug(
        {
          id: email.id,
          retryDelay: this.retryDelay,
          nextRetry: new Date(Date.now() + this.retryDelay).toISOString(),
        },
        "🔄 Scheduling retry"
      );

      await prisma.sequenceContact.update({
        where: { id: email.id },
        data: {
          nextScheduledAt: new Date(Date.now() + this.retryDelay),
        },
      });

      // Re-throw error for higher-level handling
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

    const nextEmail = await prisma.sequenceContact.findFirst({
      where: {
        completed: false,
        nextScheduledAt: {
          not: null,
        },
      },
      orderBy: {
        nextScheduledAt: "asc",
      },
      select: {
        id: true,
        nextScheduledAt: true,
        currentStep: true,
        contact: {
          select: {
            email: true,
          },
        },
      },
    });

    if (!nextEmail) {
      logger.info("📭 No scheduled emails found");
      return { currentTime: new Date() };
    }

    logger.info("📧 Next scheduled email:", {
      id: nextEmail.id,
      scheduledTime: nextEmail.nextScheduledAt?.toISOString(),
      contact: nextEmail.contact.email,
      step: nextEmail.currentStep,
      timeUntilSend: nextEmail.nextScheduledAt
        ? `${Math.round(
            (nextEmail.nextScheduledAt.getTime() - Date.now()) / 1000 / 60
          )} minutes`
        : "unknown",
    });

    return {
      nextEmail: nextEmail
        ? {
            id: nextEmail.id,
            scheduledTime: nextEmail.nextScheduledAt,
            contact: nextEmail.contact.email,
            step: nextEmail.currentStep,
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

      logger.info("⏰ Advancing time to process next email", {
        from: new Date().toISOString(),
        to: targetTime.toISOString(),
        emailId: nextEmail.id,
        contact: nextEmail.contact,
      });

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
