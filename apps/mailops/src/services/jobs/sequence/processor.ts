import { Queue, Job } from "bullmq";
import {
  StepPriority,
  StepTiming,
  StepTypeEnum,
  BusinessHours,
  BusinessScheduleEnum,
} from "@coldjot/types";
import { logger } from "@/lib/log";
import { RateLimitService } from "@/services/core/rate-limit/service";
import { ScheduleGenerator, scheduleGenerator } from "@/lib/schedule";
import { getActiveSequenceContacts, getSequenceWithDetails } from "./helper";
import { QUEUE_NAMES } from "@/config";
import { getWorkerOptions } from "@/config";
import { BaseProcessor } from "../base-processor";
import { ServiceManager } from "@/services/service-manager";
import { processContactShared } from "./helper";

// Define our sequence processing types
interface SequenceWithRelations {
  id: string;
  userId: string;
  name?: string;
  sequenceMailbox: {
    id: string;
    sequenceId: string;
    mailboxId: string;
    aliasId: string | null;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
  };
  steps: {
    id: string;
    sequenceId: string;
    stepType: StepTypeEnum;
    priority: StepPriority;
    timing: StepTiming;
    delayAmount: number | null;
    delayUnit: string | null;
    subject: string | null;
    order: number;
    replyToThread: boolean;
    templateId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }[];
  businessHours: BusinessHours | null;
}

interface ProcessingJobData {
  sequenceId: string;
  userId: string;
  scheduleType?: BusinessScheduleEnum;
  businessHours?: BusinessHours;
  testMode?: boolean;
  disableSending?: boolean;
}

export class SequenceProcessor extends BaseProcessor<ProcessingJobData> {
  private rateLimitService: RateLimitService;
  private scheduleGenerator: ScheduleGenerator;

  private serviceManager = ServiceManager.getInstance();
  private jobManager = this.serviceManager.getJobManager();

  constructor(queue: Queue) {
    super(queue, QUEUE_NAMES.SEQUENCE, getWorkerOptions(QUEUE_NAMES.SEQUENCE));

    this.rateLimitService = RateLimitService.getInstance();
    this.scheduleGenerator = scheduleGenerator;
  }

  protected async process(job: Job<ProcessingJobData>): Promise<void> {
    try {
      const result = await this.processSequence(job.data);
      if (!result.success) {
        throw new Error(result.error || "Failed to process sequence");
      }
    } catch (error) {
      logger.error({ err: error }, `Failed to process sequence job ${job.id}`);
      throw error;
    }
  }

  /**
   * Process a sequence job
   */
  private async processSequence(
    data: ProcessingJobData
  ): Promise<{ success: boolean; error?: string }> {
    logger.info({
      testMode: data.testMode ? "✨ Test Mode" : "🔥 Production Mode",
    }, `🚀 Starting sequence: ${data.sequenceId}`);

    try {
      // Check rate limits first
      const { allowed } = await this.rateLimitService.checkRateLimit(
        data.userId,
        data.sequenceId
      );

      if (!allowed) {
        logger.warn("⚠️ Rate limit exceeded:");
        return { success: false, error: "Rate limit exceeded" };
      }

      // Get sequence and validate
      const dbSequence = await getSequenceWithDetails(data.sequenceId);
      // Don't dump the full sequence row — it includes step content (PII).
      logger.info({ sequenceId: data.sequenceId }, "🎮 Sequence");

      if (!dbSequence) {
        throw new Error("Sequence not found");
      }

      if (!dbSequence.sequenceMailbox) {
        throw new Error("Sequence mailbox not found");
      }

      // Cast database sequence to our expected type. The repository returns
      // a narrowed shape; cast through unknown to the local SequenceWithRelations
      // type (transitional — Phase 4 replaces this processor).
      const sequence = {
        ...dbSequence,
        sequenceMailbox: dbSequence.sequenceMailbox,
        steps: dbSequence.steps.map((step) => ({
          ...step,
          stepType: step.stepType as StepTypeEnum,
          priority: step.priority as StepPriority,
          timing: step.timing as StepTiming,
          subject: step.subject,
          replyToThread: step.replyToThread ?? false,
          templateId: step.templateId,
        })),
        businessHours: dbSequence.businessHours
          ? {
              ...dbSequence.businessHours,
              type: dbSequence.businessHours.type as BusinessScheduleEnum,
            }
          : null,
      } as unknown as SequenceWithRelations;

      logger.info({
        steps: sequence.steps.length,
        businessHours: sequence.businessHours ? "✓" : "✗",
      }, `📋 Sequence details for ${sequence.name}`);

      // TODO :  Make this a separate job in batch
      // Get active contacts
      const contacts = await getActiveSequenceContacts(data.sequenceId);
      logger.info({
        total: contacts.length,
        sequence: sequence.name,
      }, `👥 Processing contacts`);

      // Process each contact
      for (const sequenceContact of contacts) {
        try {
          await this.processContact(sequenceContact, sequence, data);
        } catch (error) {
          // Log contact id only — the email address is PII.
          logger.error(
            error,
            `❌ Error processing contact ${sequenceContact.contactId}:`
          );
          // Continue with next contact even if one fails
          continue;
        }
      }

      logger.info({
        totalContacts: contacts.length,
        totalSteps: sequence.steps.length,
      }, `✨ Sequence processing completed: ${sequence.name}`);

      return { success: true };
    } catch (error) {
      logger.error({ err: error }, "❌ Error processing sequence");
      throw error;
    }
  }

  /**
   * Process an individual contact in the sequence
   */
  private async processContact(
    sequenceContact: any,
    sequence: SequenceWithRelations,
    data: ProcessingJobData
  ): Promise<void> {
    await processContactShared(
      {
        sequence,
        contact: sequenceContact.contact,
        currentStep: sequenceContact.currentStep || 1,
        testMode: data.testMode,
        disableSending: data.disableSending,
        threadId: sequenceContact.threadId,
        startedAt: sequenceContact.startedAt,
      },
      this.jobManager
    );
  }
}
