import { Queue, Job } from "bullmq";
import { BaseProcessor } from "../base-processor";
import { logger } from "@/lib/log";
import { prisma } from "@mailjot/database";
import { randomUUID } from "crypto";
import { rateLimiter } from "@/services/v1/rate-limit/rate-limiter";
import { schedulingService } from "@/services/v1/schedule/scheduling-service";
import { QueueService } from "@/services/v1/queue/queue-service";
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
} from "@mailjot/types";
import { EMAIL_SCHEDULER_CONFIG } from "@/config";
import { QUEUE_NAMES } from "@/config/queue/queue";
// Define the type for what we actually need from the sequence
type SequenceWithRelations = {
  id: string;
  userId: string;
  steps: SequenceStep[];
  businessHours: BusinessHours | null;
};

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
  private queueService: QueueService;
  private checkInterval: number = EMAIL_SCHEDULER_CONFIG.CHECK_INTERVAL;
  private retryDelay: number = EMAIL_SCHEDULER_CONFIG.RETRY_DELAY;

  constructor(queue: Queue) {
    super(queue, QUEUE_NAMES.EMAIL_SCHEDULE, {
      concurrency: 5,
      limiter: {
        max: 100,
        duration: 1000, // 1 second
      },
      connection: {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      },
    });
    this.queueService = QueueService.getInstance();
    logger.info("📧 Email Scheduling Processor initialized", {
      checkInterval: this.checkInterval,
      retryDelay: this.retryDelay,
    });
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

      // Find emails that are due to be sent with the correct structure
      const dueEmails = await prisma.sequenceContact.findMany({
        where: {
          nextScheduledAt: {
            lte: new Date(),
          },
          completed: false,
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

      logger.info("📥 Found emails to process", {
        count: dueEmails.length,
        emails: dueEmails.map((e) => ({
          id: e.id,
          sequenceId: e.sequenceId,
          contactId: e.contactId,
          currentStep: e.currentStep,
          email: e.contact.email,
          scheduledTime: e.nextScheduledAt?.toISOString(),
        })),
      });

      // Process each email
      for (const email of dueEmails) {
        try {
          // Add the required status field to each step
          const emailWithStatus: SequenceContactWithRelations = {
            ...email,
            sequence: {
              ...email.sequence,
              steps: email.sequence.steps.map((step) => ({
                ...step,
                status: StepStatus.ACTIVE,
                stepType: step.stepType as StepType,
                priority: step.priority as StepPriority,
                timing: step.timing as StepTiming,
              })),
            },
          };

          logger.debug(
            {
              id: email.id,
              sequenceId: email.sequenceId,
              contactId: email.contactId,
              currentStep: email.currentStep,
              email: email.contact.email,
              step: emailWithStatus.sequence.steps[email.currentStep],
            },
            "🔄 Processing email"
          );

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

    logger.info("📧 Processing email", {
      id: email.id,
      sequenceId: sequence.id,
      contactId: contact.id,
      email: contact.email,
      currentStep: email.currentStep,
      totalSteps: sequence.steps.length,
    });

    try {
      // 1. Check rate limits
      logger.debug("🔍 Checking rate limits", {
        userId: sequence.userId,
        sequenceId: sequence.id,
        contactId: contact.id,
      });

      const { allowed, info } = await rateLimiter.checkRateLimit(
        sequence.userId,
        sequence.id,
        contact.id
      );

      if (!allowed) {
        logger.warn("⚠️ Rate limit exceeded", {
          userId: sequence.userId,
          sequenceId: sequence.id,
          contactId: contact.id,
          info,
        });
        return;
      }

      // 2. Get current step
      const currentStep = sequence.steps[email.currentStep] as
        | SequenceStep
        | undefined;

      if (!currentStep) {
        logger.error("❌ Step not found", {
          sequenceId: sequence.id,
          currentStep: email.currentStep,
          totalSteps: sequence.steps.length,
        });

        // Verify if the step still exists in the database
        const stepExists = await prisma.sequenceStep.findFirst({
          where: {
            sequenceId: sequence.id,
            order: email.currentStep,
          },
        });

        if (!stepExists) {
          logger.info("🗑️ Step has been deleted, cleaning up", {
            sequenceId: sequence.id,
            currentStep: email.currentStep,
          });

          // If this was the last step, mark the sequence as completed
          if (email.currentStep >= sequence.steps.length - 1) {
            await prisma.sequenceContact.update({
              where: { id: email.id },
              data: {
                completed: true,
                completedAt: new Date(),
                nextScheduledAt: null,
              },
            });
            logger.info(
              "✅ Marked sequence as completed due to deleted last step"
            );
          } else {
            // Skip to the next step
            await prisma.sequenceContact.update({
              where: { id: email.id },
              data: {
                currentStep: email.currentStep + 1,
                nextScheduledAt: new Date(), // Schedule immediately
              },
            });
            logger.info("⏭️ Skipped deleted step, moving to next step");
          }
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

      const nextSendTime = await schedulingService.calculateNextRun(
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

      const previousStep = currentStep.order - 1;
      const previousSubject = sequence.steps[previousStep]?.subject || "";

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
        id: randomUUID(),
        type: EmailJobEnum.SEND,
        priority: 1,
        data: {
          sequenceId: sequence.id,
          contactId: contact.id,
          stepId: currentStep.id,
          userId: sequence.userId,
          to: contact.email,
          subject: subject || currentStep.subject || "",
          threadId:
            currentStep.replyToThread && sequenceContact?.threadId
              ? sequenceContact.threadId
              : undefined,
          scheduledTime: nextSendTime.toISOString(),
        },
      };

      logger.info("📧 Created email job with thread details");

      // 5. Add to queue
      logger.debug(
        {
          jobId: emailJob.id,
          type: emailJob.type,
          priority: emailJob.priority,
          scheduledTime: emailJob.data.scheduledTime,
        },
        "📤 Adding email job to queue"
      );

      await this.queueService.addEmailJob(emailJob);

      logger.info(
        {
          jobId: emailJob.id,
          scheduledTime: nextSendTime.toISOString(),
          to: contact.email,
          sequenceId: sequence.id,
          stepId: currentStep.id,
        },
        "📧 Created email job"
      );

      // 6. Update sequence progress
      const isLastStep = email.currentStep + 1 >= sequence.steps.length;
      logger.debug(
        {
          id: email.id,
          currentStep: email.currentStep,
          isLastStep,
          nextScheduledAt: isLastStep ? null : nextSendTime,
        },
        "📝 Updating sequence progress"
      );

      await prisma.sequenceContact.update({
        where: { id: email.id },
        data: {
          lastProcessedAt: new Date(),
          nextScheduledAt: isLastStep ? null : nextSendTime,
          currentStep: email.currentStep + 1,
          completed: isLastStep,
          completedAt: isLastStep ? new Date() : null,
        },
      });

      // 8. Increment rate limit counters
      logger.debug("🔄 Incrementing rate limit counters");

      await rateLimiter.incrementCounters(
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
          nextStep: email.currentStep + 1,
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
      schedulingService.advanceTimeTo(targetTime);

      // Trigger immediate check
      await this.processScheduledEmails();
    } else {
      logger.info("📭 No emails to advance to");
    }
  }
}