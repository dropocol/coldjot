import { Job, Queue } from "bullmq";
import { BaseProcessor } from "../base-processor";
import { logger } from "@/lib/log";
import { prisma } from "@coldjot/database";
import {
  SendEmailOptions,
  EmailResult,
  SequenceContactStatusEnum,
  type EmailTrackingMetadata,
  type SequenceStep,
  StepTypeEnum,
  type EmailJob,
} from "@coldjot/types";
import { rateLimitService } from "@/services/core/rate-limit/service";
import { createEmailTracking } from "@/lib/tracking";
import { ServiceManager } from "@/services/service-manager";
import {
  updateSequenceContactThreadId,
  updateSequenceContactStatus,
  getDefaultBusinessHours,
} from "@/services/jobs/sequence/helper";
import { emailService } from "@/lib/email";
import { QUEUE_NAMES } from "@/config";
import { getWorkerOptions } from "@/config";
import { ScheduleGenerator, scheduleGenerator } from "@/lib/schedule";
import { replacePlaceholders, validatePlaceholders } from "@/lib/placeholders";
import { getSequenceMailboxWithId } from "@/lib/mailbox";

export class EmailProcessor extends BaseProcessor<EmailJob> {
  private serviceManager = ServiceManager.getInstance();
  private jobManager = this.serviceManager.getJobManager();

  private scheduleGenerator: ScheduleGenerator;

  constructor(queue: Queue) {
    super(queue, QUEUE_NAMES.EMAIL, getWorkerOptions(QUEUE_NAMES.EMAIL));
    this.scheduleGenerator = scheduleGenerator;
  }

  protected async process(job: Job<EmailJob>): Promise<void> {
    try {
      const result = await this.processEmail(job.data);
      if (!result.success) {
        throw new Error(result.error || "Failed to process email");
      }
    } catch (error) {
      logger.error(`Failed to process email job ${job.id}:`, error);
      throw error;
    }
  }

  private async processEmail(
    data: EmailJob
  ): Promise<{ success: boolean; error?: string }> {
    logger.info(data, `📨 Starting to process email job`);

    try {
      // Check if thread has already received a reply or bounce
      // TODO : Also remove the job from the queue if it has already been processed
      const shouldProceed = await this.checkThreadEvents(data);
      if (!shouldProceed) {
        logger.info("📭 Skipping email send due to existing thread events");
        return { success: true };
      }

      // Validate rate limits
      logger.info(
        `🔍 Checking rate limits for user ${data.userId} --- sequence ${data.sequenceId} --- contact ${data.contactId}`
      );
      await this.validateRateLimits(data);

      // Get current step with sequence info
      // TODO : Check if the step is available
      logger.info(`🔍 Fetching sequence step ${data.stepId}`);
      const step = await this.getAndValidateSequenceStep(data.stepId);

      // Get contact info
      // TODO : Check if the contact is available
      logger.info(`🔍 Fetching contact info ${data.contactId}`);
      const contact = await prisma.contact.findUnique({
        where: { id: data.contactId },
      });

      if (!contact) {
        throw new Error(`Contact ${data.contactId} not found`);
      }

      logger.info(`🔍 Fetching mailbox info ${data.sequenceMailboxId}`);
      // const mailbox = await getSenderMailbox(
      //   data.userId,
      //   data.sequenceMailboxId
      // );

      console.log("🔍 Fetching mailbox info with data", data);
      const mailbox = await getSequenceMailboxWithId(data.sequenceMailboxId);

      if (!mailbox) {
        // throw new Error(`No valid mailbox found for user ${data.userId}`);
        return { success: false, error: "No valid mailbox found" };
      }

      // Create tracking metadata
      logger.info("📊 Creating tracking metadata");
      const trackingMetadata: EmailTrackingMetadata = {
        email: data.to,
        userId: data.userId,
        sequenceId: data.sequenceId,
        stepId: data.stepId,
        contactId: data.contactId,
      };

      // Create tracking object
      const tracking = await createEmailTracking(trackingMetadata);
      if (!tracking) {
        throw new Error("Failed to create tracking information");
      }

      // Replace placeholders in subject and content
      const processedSubject = replacePlaceholders(
        data.subject || step.subject || "",
        { contact }
      );
      const processedContent = replacePlaceholders(step.content || "", {
        contact,
      });

      // Validate if all placeholders are replaced
      const missingPlaceholders = validatePlaceholders(processedContent, {
        contact,
      });
      if (missingPlaceholders.length > 0) {
        logger.warn(
          `⚠️ Missing values for placeholders: ${missingPlaceholders.join(", ")}`,
          {
            contactId: data.contactId,
            stepId: data.stepId,
          }
        );
      }

      // Prepare email options
      logger.info(
        {
          to: data.to,
          subject: processedSubject,
          threadId: data.threadId,
          testMode: data.testMode,
          disableSending: data.disableSending,
        },
        "📧 Preparing email options"
      );
      const emailOptions: SendEmailOptions = {
        to: data.to,
        subject: processedSubject,
        html: processedContent,
        replyTo: mailbox.email || "",
        threadId: data.threadId || "",
        tracking: tracking,
        mailbox: mailbox,
        userId: data.userId,
        sequenceId: data.sequenceId,
        contactId: data.contactId,
        stepId: data.stepId,
        testMode: data.testMode,
        disableSending: data.disableSending,
      };

      // Send email
      logger.info(
        {
          to: emailOptions.to,
          subject: emailOptions.subject,
          testMode: emailOptions.testMode,
          disableSending: emailOptions.disableSending,
        },
        "📤 Sending email"
      );

      const emailResult = await emailService.sendEmail(emailOptions);

      if (emailResult.success) {
        logger.info(
          {
            messageId: emailResult.messageId,
            threadId: emailResult.threadId,
          },
          "✅ Email sent successfully"
        );

        await this.handleSuccessfulEmail(data, emailResult, step);

        // Save information in EmailThread
        if (step.order === 1) {
          await prisma.emailThread.create({
            data: {
              threadId: emailResult.threadId!,
              sequenceId: data.sequenceId,
              contactId: data.contactId,
              userId: data.userId,
              firstMessageId: emailResult.messageId!,
              subject: data.subject || step.subject || "",
              isFake: emailResult.isFake ?? false,
            },
          });
        }

        // Update contact threadId
        await updateSequenceContactThreadId(
          contact.id,
          data.sequenceId,
          emailResult.threadId!
        );

        // If in test mode, trigger the next email in sequence after a short delay
        if (data.testMode) {
          await this.testEmailSequence();
        }
      }

      return { success: true };
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : "Unknown error",
          ...data,
        },
        "❌ Error processing email - 1"
      );
      await this.handleEmailError(error, data);
      throw error;
    }
  }

  private validateEmailData(data: EmailJob): void {
    if (!data.to) {
      throw new Error("Email recipient is required");
    }
    if (!data.subject) {
      throw new Error("Email subject is required");
    }
    if (!data.userId) {
      throw new Error("User ID is required");
    }
    if (!data.stepId) {
      throw new Error("Step ID is required");
    }
  }

  private async validateRateLimits(data: EmailJob) {
    // TODO : add info to the logger
    const { allowed } = await rateLimitService.checkRateLimit(
      data.userId,
      data.sequenceId,
      data.contactId
    );

    if (!allowed) {
      logger.warn("⚠️ Rate limit exceeded:");
      throw new Error("Rate limit exceeded");
    }
  }

  private async getAndValidateSequenceStep(
    stepId: string
  ): Promise<SequenceStep> {
    const step = await prisma.sequenceStep.findUnique({
      where: { id: stepId },
      include: {
        sequence: {
          select: {
            id: true,
            userId: true,
            status: true,
            name: true,
          },
        },
      },
    });

    if (!step) {
      logger.error(`❌ Step ${stepId} not found - it may have been deleted`);
      throw new Error(`Step ${stepId} not found - it may have been deleted`);
    }

    // Cast the step to include required StepTypeEnum
    return {
      ...step,
      stepType: step.stepType as StepTypeEnum,
    } as SequenceStep;
  }

  private async handleSuccessfulEmail(
    data: EmailJob,
    result: EmailResult,
    step: any
  ) {
    // Get the total steps of a sequence
    const totalSteps = await prisma.sequenceStep.count({
      where: { sequenceId: data.sequenceId },
    });

    const sequence = await prisma.sequence.findUnique({
      where: { id: data.sequenceId },
      include: {
        businessHours: true,
      },
    });

    if (!sequence) {
      throw new Error(`Sequence ${data.sequenceId} not found`);
    }

    // If the current step is not the last step, update the status to in progress
    if (step.order < totalSteps) {
      // First update to IN_PROGRESS to indicate email was sent
      await updateSequenceContactStatus(
        data.sequenceId,
        data.contactId,
        SequenceContactStatusEnum.IN_PROGRESS
      );

      // calculate the next step
      const nextStepOrder = step.order + 1;

      const steps = await prisma.sequenceStep.findMany({
        where: { sequenceId: data.sequenceId },
      });

      logger.info(steps, "🚀 ~ EmailProcessor ~ steps:");

      const nextStep = steps[nextStepOrder - 1];

      logger.info(nextStep, "🚀 ~ EmailProcessor ~ nextStep:");

      // calculate the nextRunTime
      const nextRunTime = await this.scheduleGenerator.calculateNextRun(
        new Date(),
        nextStep as SequenceStep,
        sequence.businessHours || getDefaultBusinessHours()
      );

      logger.info(nextRunTime, "🚀 ~ EmailProcessor ~ nextRunTime:");

      // update the next step to scheduled with nextScheduledAt
      await updateSequenceContactStatus(
        data.sequenceId,
        data.contactId,
        SequenceContactStatusEnum.IN_PROGRESS,
        {
          currentStep: nextStepOrder,
          nextScheduledAt: nextRunTime,
        }
      );
    } else {
      // This was the last step, mark as completed
      await updateSequenceContactStatus(
        data.sequenceId,
        data.contactId,
        SequenceContactStatusEnum.COMPLETED,
        {
          completed: true,
          completedAt: new Date(),
          nextScheduledAt: null,
        }
      );
    }
  }

  private async handleEmailError(error: unknown, data: EmailJob) {
    logger.error(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        to: data.to,
        sequenceId: data.sequenceId,
        stepId: data.stepId,
      },
      "❌ Error processing email - 2"
    );
  }

  private async testEmailSequence() {
    logger.info(
      "🧪 Test mode: Triggering next email in sequence in 10 seconds"
    );

    // const { nextEmail } = await emailSchedulingService.checkNextScheduledEmail();
    // if (nextEmail) {
    //   logger.info("🧪 Test mode: Processing next email in sequence");
    //   await emailSchedulingService.advanceToNextEmail();
    //   await schedulingService.resetTime();
    // }
  }

  private async checkThreadEvents(data: EmailJob): Promise<boolean> {
    logger.info(
      `🔍 Checking thread events for sequence ${data.sequenceId} and contact ${data.contactId}`
    );

    // If there's no threadId, it means this is a new thread, so allow it
    if (!data.threadId) {
      return true;
    }

    // Check for existing bounce or reply events
    const existingEvents = await prisma.emailEvent.findMany({
      where: {
        sequenceId: data.sequenceId,
        contactId: data.contactId,
        type: {
          in: ["BOUNCED", "replied"],
        },
      },
    });

    if (existingEvents.length > 0) {
      const eventTypes = existingEvents.map((event) => event.type).join(", ");
      logger.warn(
        `⚠️ Thread already has ${eventTypes} event(s). Skipping email send.`,
        {
          threadId: data.threadId,
          sequenceId: data.sequenceId,
          contactId: data.contactId,
          events: existingEvents,
        }
      );
      return false;
    }

    return true;
  }
}
