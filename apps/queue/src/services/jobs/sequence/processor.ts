import { Queue } from "bullmq";
import {
  ProcessingJob,
  EmailJob,
  EmailJobEnum,
  SequenceContactStatusEnum,
  SequenceStep,
} from "@mailjot/types";
import { logger } from "@/lib/log";
import { RateLimitService } from "@/services/core/rate-limit/service";
import { ScheduleGenerator, scheduleGenerator } from "@/lib/schedule";
import { randomUUID } from "crypto";
import {
  getUserGoogleAccount,
  getDefaultBusinessHours,
  updateSequenceContactStatus,
  updateSequenceContactProgress,
  getActiveSequenceContacts,
  getSequenceWithDetails,
  getContactProgress,
} from "./helper";

export class SequenceProcessor {
  private queue: Queue;
  private rateLimitService: RateLimitService;
  private scheduleGenerator: ScheduleGenerator;

  constructor(queue: Queue) {
    this.queue = queue;
    this.rateLimitService = RateLimitService.getInstance();
    this.scheduleGenerator = scheduleGenerator;
  }

  /**
   * Process a sequence job
   */
  async process(
    job: ProcessingJob
  ): Promise<{ success: boolean; error?: string }> {
    const { data } = job;
    logger.info(`🚀 Starting sequence: ${data.sequenceId}`, {
      jobId: job.id,
      testMode: data.testMode ? "✨ Test Mode" : "🔥 Production Mode",
    });

    try {
      // Check rate limits first
      const { allowed, info } = await this.rateLimitService.checkRateLimit(
        data.userId,
        data.sequenceId
      );

      if (!allowed) {
        logger.warn("⚠️ Rate limit exceeded:", info);
        return { success: false, error: "Rate limit exceeded" };
      }

      // Get sequence and validate
      const sequence = await getSequenceWithDetails(data.sequenceId);
      logger.info(sequence, "🎮 Sequence");

      if (!sequence) {
        throw new Error("Sequence not found");
      }

      logger.info(`📋 Sequence details for ${sequence.name}:`, {
        steps: sequence.steps.length,
        businessHours: sequence.businessHours ? "✓" : "✗",
      });

      // Get active contacts
      const contacts = await getActiveSequenceContacts(data.sequenceId);
      logger.info(`👥 Processing contacts:`, {
        total: contacts.length,
        sequence: sequence.name,
      });

      // Get user's Google account
      const googleAccount = await getUserGoogleAccount(data.userId);
      if (!googleAccount) {
        throw new Error(`No valid email account found for user ${data.userId}`);
      }

      // Process each contact
      for (const sequenceContact of contacts) {
        logger.info(`👤 Processing contact: ${sequenceContact.contact.email}`, {
          sequence: sequence.name,
        });

        // Check contact rate limit
        const contactRateLimit = await this.rateLimitService.checkRateLimit(
          data.userId,
          data.sequenceId,
          sequenceContact.contact.id
        );

        if (!contactRateLimit.allowed) {
          logger.warn("⚠️ Contact rate limit exceeded:", contactRateLimit.info);
          continue;
        }

        // Get contact's progress
        const progress = await getContactProgress(
          data.sequenceId,
          sequenceContact.contact.id
        );
        const currentStepIndex = progress?.currentStep ?? 0;

        // Log progress status
        logger.info(`📊 Contact progress:`, {
          contact: sequenceContact.contact.email,
          currentStep: currentStepIndex + 1,
          totalSteps: sequence.steps.length,
          hasExistingProgress: !!progress,
        });

        // Check if sequence is completed
        if (currentStepIndex >= sequence.steps.length) {
          logger.info(
            `✅ Sequence completed for contact: ${sequenceContact.contact.email}`
          );
          await updateSequenceContactStatus(
            sequence.id,
            sequenceContact.id,
            SequenceContactStatusEnum.COMPLETED
          );
          continue;
        }

        // Get current step
        const currentStep = sequence.steps[currentStepIndex];
        if (!currentStep) {
          logger.error(
            `❌ Step not found at index ${currentStepIndex} for sequence ${sequence.name}`
          );
          continue;
        }

        // Get next step
        const nextStep = sequence.steps[currentStepIndex + 1];
        if (!nextStep) {
          logger.info(
            `ℹ️ No next step found - this is the last step for sequence ${sequence.name}`
          );
        }

        // Log step details
        logger.info(`📝 Processing step ${currentStepIndex + 1}:`, {
          step: currentStepIndex + 1,
          totalSteps: sequence.steps.length,
          timing: currentStep.timing,
          delay: {
            amount: currentStep.delayAmount || 0,
            unit: currentStep.delayUnit || "minutes",
          },
        });

        // Calculate next send time using scheduling service
        const nextSendTime = this.scheduleGenerator.calculateNextRun(
          new Date(),
          nextStep as SequenceStep,
          sequence.businessHours || getDefaultBusinessHours()
        );

        logger.info(
          `📅 Scheduling email for contact: ${sequenceContact.contact.email}`,
          {
            step: currentStepIndex + 1,
            totalSteps: sequence.steps.length,
            sendTime: nextSendTime.toISOString(),
            subject: currentStep.subject,
          }
        );

        // Get previous subject from previous step if replyToThread is true
        const previousStep = sequence.steps[currentStepIndex - 1];
        const previousSubject = previousStep?.subject || "";
        const subject = currentStep.replyToThread
          ? `Re: ${previousSubject}`
          : currentStep.subject;

        // Create email job
        const emailJob: EmailJob = {
          id: randomUUID(),
          type: EmailJobEnum.SEND,
          priority: 1,
          data: {
            sequenceId: sequence.id,
            contactId: sequenceContact.contact.id,
            stepId: currentStep.id,
            userId: data.userId,
            to: data.testMode
              ? process.env.TEST_EMAIL || googleAccount.email || ""
              : sequenceContact.contact.email,
            subject: subject || "",
            threadId: sequenceContact.threadId || undefined,
            testMode: data.testMode || false,
            scheduledTime: nextSendTime.toISOString(),
          },
        };

        // Add email job to queue
        logger.info(
          {
            jobId: emailJob.id,
            step: currentStepIndex + 1,
            totalSteps: sequence.steps.length,
          },
          `📬 Creating email job`
        );

        await this.queue.add("email", emailJob.data, {
          jobId: emailJob.id,
          priority: emailJob.priority,
          delay: nextSendTime.getTime() - Date.now(),
        });

        // Update progress
        await updateSequenceContactProgress(
          sequence.id,
          sequenceContact.contact.id,
          currentStepIndex + 1,
          nextSendTime
        );

        // Update contact status
        logger.info(
          `📊 Updating contact status: ${sequenceContact.contact.id} to SCHEDULED`
        );
        await updateSequenceContactStatus(
          sequence.id,
          sequenceContact.contact.id,
          SequenceContactStatusEnum.SCHEDULED
        );

        // Increment rate limit counters
        await this.rateLimitService.incrementCounters(
          data.userId,
          sequence.id,
          sequenceContact.contact.id
        );

        // Add rate limiting delay between contacts
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      logger.info(`✨ Sequence processing completed: ${sequence.name}`, {
        totalContacts: contacts.length,
        totalSteps: sequence.steps.length,
      });

      return { success: true };
    } catch (error) {
      logger.error(`❌ Error processing sequence job: ${job.id}`, error);
      throw error;
    }
  }
}

// Export factory function for service manager
export function createSequenceProcessor(queue: Queue): SequenceProcessor {
  return new SequenceProcessor(queue);
}
