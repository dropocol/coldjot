import { Job, Queue } from "bullmq";
import { BaseProcessor } from "../base-processor";
import { logger } from "@/lib/log";
import {
  SendEmailOptions,
  EmailResult,
  SequenceContactStatusEnum,
  EmailTrackingStatusEnum,
  type EmailTrackingMetadata,
  type SequenceStep,
  StepTypeEnum,
  type EmailJob,
  BusinessScheduleEnum,
} from "@coldjot/types";
import { rateLimitService } from "@/services/core/rate-limit/service";
import { trackingService } from "@/services/domain/tracking.service";
import {
  updateSequenceContactThreadId,
  updateSequenceContactStatus,
  getDefaultBusinessHours,
} from "@/services/jobs/sequence/helper";
import { sendEmailService } from "@/services/domain/send-email.service";
import { QUEUE_NAMES } from "@/config";
import { getWorkerOptions } from "@/config";
import { ScheduleGenerator, scheduleGenerator } from "@/lib/schedule";
import { replacePlaceholders, validatePlaceholders } from "@/lib/placeholders";
import { getSequenceMailboxWithId } from "@/lib/mailbox";
import { gmailClientService } from "@/lib/google";
import { determineEmailSubject } from "@/lib/email-subject";
import { prisma } from "@coldjot/database";

export class EmailProcessor extends BaseProcessor<EmailJob> {
  private scheduleGenerator: ScheduleGenerator;
  private readonly db = prisma;

  constructor(queue: Queue, dlQueues: Map<string, Queue> = new Map()) {
    super(queue, QUEUE_NAMES.EMAIL, getWorkerOptions(QUEUE_NAMES.EMAIL), dlQueues);
    this.scheduleGenerator = scheduleGenerator;
  }

  protected async process(job: Job<EmailJob>): Promise<void> {
    try {
      // job.id is `string | undefined` until BullMQ assigns one; fall back to
      // an empty string so the idempotency guard's where-clause stays valid
      // (an empty jobId simply won't match a prior "sent" row).
      const result = await this.processEmail(job.data, job.id ?? "");
      if (!result.success) {
        throw new Error(result.error || "Failed to process email");
      }
    } catch (error) {
      logger.error({ err: error }, `Failed to process email job ${job.id}`);
      throw error;
    }
  }

  private async processEmail(
    data: EmailJob,
    jobId: string
  ): Promise<{ success: boolean; error?: string }> {
    logger.info(
      { sequenceId: data.sequenceId, contactId: data.contactId, stepId: data.stepId, jobId },
      "📨 Starting to process email job"
    );

    try {
      // Idempotency guard (plan 10): if a sent row already exists for this
      // BullMQ job, a retry is re-running an already-successful send — skip.
      const alreadySent = await this.db.emailTracking.findSentByJobId(jobId);
      if (alreadySent) {
        logger.info({ jobId }, "📧 Email already sent for this job, skipping (idempotency)");
        return { success: true };
      }

      // Check if thread has already received a reply or bounce
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

      // get template info
      const template = await this.db.template.findById(step.templateId || "");

      if (template) {
        step.subject = template.subject;
        step.content = template.content;
      }

      if (step.replyToThread) {
        // Get original subject from thread
      }

      // Get contact info
      // Use findActiveById (sub-plan 06): a contact soft-deleted in the
      // window between scheduling and send must NOT receive this email.
      // Returns null for both hard-deleted and soft-deleted rows.
      logger.info(`🔍 Fetching contact info ${data.contactId}`);
      const contact = await this.db.contact.findActiveById(data.contactId);

      if (!contact) {
        // Contact was deleted (soft or hard) between scheduling and send, or
        // never existed. Skip this send cleanly instead of failing the job
        // (a retry wouldn't help). Warn so the skip is debuggable.
        logger.warn(
          {
            contactId: data.contactId,
            sequenceId: data.sequenceId,
            stepId: data.stepId,
            jobId,
          },
          "Skipping send: contact no longer active (deleted or not found)"
        );
        return { success: true };
      }

      logger.info(`🔍 Fetching mailbox info ${data.sequenceMailboxId}`);

      const mailbox = await getSequenceMailboxWithId(data.sequenceMailboxId);

      if (!mailbox) {
        // throw new Error(`No valid mailbox found for user ${data.userId}`);
        return { success: false, error: "No valid mailbox found" };
      }

      // Get Gmail client for subject fetching if needed
      const gmail =
        step.replyToThread && mailbox
          ? await gmailClientService.getClient(data.userId, mailbox.id!)
          : undefined;

      // Determine email subject based on context
      const subjectInfo = await determineEmailSubject(
        this.db,
        step,
        data.threadId,
        gmail,
        contact
      );

      logger.info({ subjectInfo }, "📧 Determined email subject");

      // Replace placeholders in content
      const processedContent = replacePlaceholders(step.content || "", {
        contact,
      });

      // Validate if all placeholders are replaced
      const missingPlaceholders = validatePlaceholders(processedContent, {
        contact,
      });
      if (missingPlaceholders.length > 0) {
        logger.warn({
            contactId: data.contactId,
            stepId: data.stepId,
          }, `⚠️ Missing values for placeholders: ${missingPlaceholders.join(", ")}`);
      }

      // Create tracking metadata
      logger.info("📊 Creating tracking metadata");
      const trackingMetadata: EmailTrackingMetadata = {
        email: data.to,
        userId: data.userId,
        sequenceId: data.sequenceId,
        stepId: data.stepId,
        contactId: data.contactId,
        subject: subjectInfo.subject, // Use the determined subject
        // Carried through to the EmailTracking.jobId column by createEmailTracking
        // so the idempotency guard above can detect duplicate sends (plan 10).
        jobId,
      };

      // Create tracking object
      const tracking = await trackingService.createTracking(trackingMetadata);
      if (!tracking) {
        throw new Error("Failed to create tracking information");
      }

      // Prepare email options
      logger.info(
        {
          to: data.to,
          subject: subjectInfo.subject,
          threadId: data.threadId,
          testMode: data.testMode,
          disableSending: data.disableSending,
        },
        "📧 Preparing email options"
      );

      const emailOptions: SendEmailOptions = {
        to: data.to,
        subject: subjectInfo.subject,
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

      const emailResult = await sendEmailService.send(emailOptions);

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
          await this.db.emailThread.record({
            threadId: emailResult.threadId!,
            sequenceId: data.sequenceId,
            contactId: data.contactId,
            userId: data.userId,
            firstMessageId: emailResult.messageId!,
            subject: subjectInfo.originalSubject || "",
            isFake: emailResult.isFake ?? false,
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
      // Log job identity only — `data` is an EmailJob with recipient PII.
      logger.error(
        {
          error: error instanceof Error ? error.message : "Unknown error",
          sequenceId: data.sequenceId,
          contactId: data.contactId,
          stepId: data.stepId,
        },
        "❌ Error processing email - 1"
      );
      await this.handleEmailError(error, data);
      throw error;
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
    const step = await this.db.sequenceStep.findWithSequenceMeta(stepId);

    if (!step) {
      logger.error(`❌ Step ${stepId} not found - it may have been deleted`);
      throw new Error(`Step ${stepId} not found - it may have been deleted`);
    }

    // Cast the step to include required StepTypeEnum
    return {
      ...step,
      stepType: step.stepType as StepTypeEnum,
    } as unknown as SequenceStep;
  }

  private async handleSuccessfulEmail(
    data: EmailJob,
    result: EmailResult,
    step: any
  ) {
    // Get the total steps of a sequence
    const totalSteps = await this.db.sequenceStep.countInSequence(data.sequenceId);

    const sequence = await this.db.sequence.findWithBusinessHours(data.sequenceId);

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

      const steps = await this.db.sequenceStep.listBySequence(data.sequenceId);

      logger.info(steps, "🚀 ~ EmailProcessor ~ steps:");

      const nextStep = steps[nextStepOrder - 1];

      logger.info(nextStep, "🚀 ~ EmailProcessor ~ nextStep:");

      // TODO : improve the enum type issue as businessHours.type is not typed
      // calculate the nextRunTime
      const nextRunTime = await this.scheduleGenerator.calculateNextRun(
        new Date(),
        nextStep as SequenceStep,
        // sequence.businessHours || getDefaultBusinessHours()
        sequence.businessHours
          ? {
              timezone: sequence.businessHours.timezone,
              workDays: sequence.businessHours.workDays,
              workHoursStart: sequence.businessHours.workHoursStart,
              workHoursEnd: sequence.businessHours.workHoursEnd,
              type: sequence.businessHours.type as BusinessScheduleEnum,
            }
          : getDefaultBusinessHours()
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
    const hasExisting = await this.db.emailEvent.existsBySequenceContactInTypes(
      data.sequenceId,
      data.contactId,
      ["BOUNCED", "replied"] as any
    );

    if (hasExisting) {
      logger.warn({
          threadId: data.threadId,
          sequenceId: data.sequenceId,
          contactId: data.contactId,
        }, `⚠️ Thread already has BOUNCED/replied event(s). Skipping email send.`);
      return false;
    }

    return true;
  }
}
