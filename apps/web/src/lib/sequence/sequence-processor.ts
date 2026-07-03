import { prisma } from "@coldjot/database";
import { queueApi } from "@/lib/queue/queue-api-client";

class SequenceProcessor {
  async launchSequence(
    sequenceId: string,
    userId: string,
    testMode = false
  ): Promise<void> {
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
    await queueApi.launchSequence(sequenceId, userId, testMode);
  }

  async pauseSequence(sequenceId: string, userId: string): Promise<void> {
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
  }

  async resumeSequence(sequenceId: string, userId: string): Promise<void> {
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
  }

  async getSequenceHealth(sequenceId: string): Promise<unknown> {
    return queueApi.getSequenceHealth(sequenceId);
  }
}

// Export singleton instance
export const sequenceProcessor = new SequenceProcessor();
