import { prisma } from "@coldjot/database";
import { logger } from "@/lib/logger";
import { queueApi } from "@/lib/queue/queue-api-client";

class SequenceProcessor {
  async launchSequence(
    sequenceId: string,
    userId: string,
    testMode = false
  ): Promise<void> {
    try {
      // Get sequence to validate it exists and belongs to user
      const sequence = await prisma.sequence.findUnique({
        where: {
          id: sequenceId,
          userId,
        },
        include: {
          steps: true,
          contacts: true,
        },
      });

      console.log("sequence", sequence);

      if (!sequence) {
        throw new Error(`Sequence ${sequenceId} not found or unauthorized`);
      }

      // if (sequence.steps.length === 0) {
      //   throw new Error("Sequence has no steps");
      // }

      // if (sequence.contacts.length === 0) {
      //   throw new Error("Sequence has no contacts");
      // }

      // Launch sequence via queue API
      const result = await queueApi.launchSequence(
        sequenceId,
        userId,
        testMode
      );
      logger.info(
        `Sequence ${sequenceId} launched with job ID ${result.jobId}`
      );
    } catch (error) {
      logger.error(`Error launching sequence ${sequenceId}:`, error);
      throw error;
    }
  }

  async pauseSequence(sequenceId: string, userId: string): Promise<void> {
    try {
      // Validate sequence ownership
      const sequence = await prisma.sequence.findUnique({
        where: {
          id: sequenceId,
          userId,
        },
      });

      if (!sequence) {
        throw new Error(`Sequence ${sequenceId} not found or unauthorized`);
      }

      // Pause sequence via queue API
      await queueApi.pauseSequence(sequenceId, userId);
      logger.info(`Sequence ${sequenceId} paused`);
    } catch (error) {
      logger.error(`Error pausing sequence ${sequenceId}:`, error);
      throw error;
    }
  }

  async resumeSequence(sequenceId: string, userId: string): Promise<void> {
    try {
      // Validate sequence ownership
      const sequence = await prisma.sequence.findUnique({
        where: {
          id: sequenceId,
          userId,
        },
      });

      if (!sequence) {
        throw new Error(`Sequence ${sequenceId} not found or unauthorized`);
      }

      // Resume sequence via queue API
      await queueApi.resumeSequence(sequenceId, userId);
      logger.info(`Sequence ${sequenceId} resumed`);
    } catch (error) {
      logger.error(`Error resuming sequence ${sequenceId}:`, error);
      throw error;
    }
  }

  async getSequenceHealth(sequenceId: string): Promise<any> {
    try {
      return await queueApi.getSequenceHealth(sequenceId);
    } catch (error) {
      logger.error(`Error getting sequence health for ${sequenceId}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const sequenceProcessor = new SequenceProcessor();
