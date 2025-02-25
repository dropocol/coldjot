import { prisma, SequenceMailbox } from "@coldjot/database";
import {
  BusinessHours,
  BusinessScheduleEnum,
  Mailbox,
  SequenceContactStatusEnum,
  SequenceContactStatusType,
} from "@coldjot/types";

import { logger } from "@/lib/log";
import { rateLimitService } from "@/services/core/rate-limit/service";
import { scheduleGenerator } from "@/lib/schedule";
import { EmailJob } from "@coldjot/types";
import { getSenderMailbox } from "@/lib/mailbox";

/**
 * Get default business hours if not provided
 */
export function getDefaultBusinessHours(): BusinessHours {
  return {
    timezone: "UTC",
    workDays: [1, 2, 3, 4, 5],
    workHoursStart: "09:00",
    workHoursEnd: "17:00",
    holidays: [],
    type: BusinessScheduleEnum.BUSINESS,
  };
}

/**
 * Update sequence contact status
 */
export async function updateSequenceContactStatus(
  sequenceId: string,
  contactId: string,
  status: SequenceContactStatusType,
  data?: any
) {
  try {
    logger.info(
      `Updating sequence contact status: ${contactId} to ${status} for sequence: ${sequenceId}`
    );

    const date = new Date();
    const completedAt =
      status === SequenceContactStatusEnum.COMPLETED ? new Date() : null;

    await prisma.sequenceContact.update({
      where: {
        sequenceId_contactId: {
          sequenceId: sequenceId,
          contactId: contactId,
        },
      },
      data: {
        status,
        completed: status === SequenceContactStatusEnum.COMPLETED,
        completedAt,
        updatedAt: date,
        lastProcessedAt: date,
        ...data,
      },
    });
  } catch (error) {
    logger.error(`Error updating sequence contact status: ${error}`);
    throw error;
  }
}

/**
 * Update sequence contact threadId
 */
export async function updateSequenceContactThreadId(
  contactId: string,
  sequenceId: string,
  threadId: string
) {
  try {
    await prisma.sequenceContact.update({
      where: { sequenceId_contactId: { sequenceId, contactId } },
      data: {
        threadId,
        lastProcessedAt: new Date(),
      },
    });
  } catch (error) {
    logger.error(`Error updating sequence contact threadId: ${error}`);
    throw error;
  }
}

/**
 * Update sequence progress
 */
export async function updateSequenceContactProgress(
  sequenceId: string,
  contactId: string,
  currentStepIndex: number,
  nextScheduledAt: Date
) {
  try {
    await prisma.sequenceContact.upsert({
      where: {
        sequenceId_contactId: {
          sequenceId,
          contactId,
        },
      },
      update: {
        currentStep: currentStepIndex,
        lastProcessedAt: new Date(),
        nextScheduledAt,
      },
      create: {
        sequenceId,
        contactId,
        currentStep: currentStepIndex,
        lastProcessedAt: new Date(),
        nextScheduledAt,
      },
    });
  } catch (error) {
    logger.error(`Error updating sequence progress: ${error}`);
    throw error;
  }
}

/**
 * Get active contacts for sequence
 */
export async function getActiveSequenceContacts(sequenceId: string) {
  return prisma.sequenceContact.findMany({
    where: {
      sequenceId,
      status: {
        notIn: ["completed", "opted_out"],
      },
    },
    include: {
      contact: true,
    },
  });
}

/**
 * Get sequence with steps and business hours
 */
export async function getSequenceWithDetails(sequenceId: string) {
  return prisma.sequence.findUnique({
    where: { id: sequenceId },
    include: {
      sequenceMailbox: true,
      steps: {
        orderBy: { order: "asc" },
      },
      businessHours: true,
    },
  });
}

/**
 * Get contact's current progress in sequence
 */
export async function getContactProgress(
  sequenceId: string,
  contactId: string
) {
  return prisma.sequenceContact.findFirst({
    where: {
      sequenceId,
      contactId,
    },
  });
}

/**
 * Reset sequence state completely
 */
export async function resetSequence(sequenceId: string): Promise<void> {
  logger.info(`🔄 Resetting sequence: ${sequenceId}`);

  try {
    // Delete all email tracking records
    await prisma.emailTracking.deleteMany({
      where: {
        metadata: {
          path: ["sequenceId"],
          equals: sequenceId,
        },
      },
    });
    logger.info(`✓ Email tracking records deleted`);

    // Delete all email events
    await prisma.emailEvent.deleteMany({
      where: {
        sequenceId,
      },
    });
    logger.info(`✓ Email events deleted`);

    // Reset sequence contacts status
    await prisma.sequenceContact.updateMany({
      where: {
        sequenceId,
      },
      data: {
        status: "pending",
        lastProcessedAt: null,
        completedAt: null,
        threadId: null,
        currentStep: 0,
        nextScheduledAt: null,
        completed: false,
        startedAt: null,
      },
    });
    logger.info(`✓ Sequence contacts reset`);

    // Reset sequence stats
    await prisma.sequenceStats.deleteMany({
      where: {
        sequenceId,
      },
    });
    logger.info(`✓ Sequence stats reset`);

    // Reset sequence health
    await prisma.sequenceHealth.deleteMany({
      where: {
        sequenceId,
      },
    });
    logger.info(`✓ Sequence health reset`);

    // Reset rate limits in Redis
    // Note: This will be handled by the rate limiter service

    logger.info(`✨ Sequence reset completed: ${sequenceId}`);
  } catch (error) {
    logger.error(`Error resetting sequence: ${error}`);
    throw error;
  }
}

/**
 * Shared interface for contact processing options
 */
interface ProcessContactOptions {
  sequence: {
    id: string;
    userId: string;
    // sequenceMailboxId: string;
    sequenceMailbox: SequenceMailbox;
    steps: any[];
    businessHours?: any;
    status?: string;
    disableSending?: boolean;
    testMode?: boolean;
  };
  contact: {
    id: string;
    email: string;
  };
  currentStep?: number;
  testMode?: boolean;
  disableSending?: boolean;
  threadId?: string;
  startedAt?: Date;
}

/**
 * Shared function to process a contact across different processors
 */
export const processContactShared = async (
  options: ProcessContactOptions,
  jobManager: any
): Promise<void> => {
  const { sequence, contact, currentStep = 1, testMode = false } = options;

  logger.info(
    {
      sequenceId: sequence.id,
      contactId: contact.id,
    },
    `👤 Processing contact: ${contact.email}`
  );

  // Check if sequence is active (early return if not)
  if (sequence.status && sequence.status !== "active") {
    logger.info(
      `👤 Sequence ${sequence.id} is paused. Skipping contact ${contact.email}`
    );
    return;
  }

  try {
    // 1. Check rate limits
    const { allowed } = await rateLimitService.checkRateLimit(
      sequence.userId,
      sequence.id,
      contact.id
    );

    if (!allowed) {
      logger.warn("⚠️ Rate limit exceeded:");
      return;
    }

    // 2. Update status to processing/pending
    await updateSequenceContactStatus(
      sequence.id,
      contact.id,
      SequenceContactStatusEnum.PENDING
    );

    // 3. Get current step
    const currentStepIndex = currentStep - 1;
    const step = sequence.steps[currentStepIndex];
    if (!step) {
      throw new Error("Step not found");
    }

    // 5. Calculate send time using scheduling service
    const sendTime = await scheduleGenerator.calculateNextRun(
      new Date(),
      step,
      sequence.businessHours || getDefaultBusinessHours()
    );

    if (!sendTime) {
      throw new Error("Could not calculate send time");
    }

    // 8. Update contact status and progress
    await updateSequenceContactStatus(
      sequence.id,
      contact.id,
      SequenceContactStatusEnum.IN_PROGRESS,
      {
        currentStep,
        nextScheduledAt: sendTime,
        startedAt: options.startedAt || new Date(),
      }
    );

    // 9. Increment rate limit counters
    await rateLimitService.incrementCounters(
      sequence.userId,
      sequence.id,
      contact.id
    );

    logger.info(`✅ Successfully processed contact: ${contact.email}`);
  } catch (error) {
    logger.error(error, `❌ Error processing contact ${contact.email}:`);

    // Update status to failed
    await updateSequenceContactStatus(
      sequence.id,
      contact.id,
      SequenceContactStatusEnum.FAILED
    );

    // Re-throw error for higher-level handling
    throw error;
  }
};
