import { prisma } from "@coldjot/database";

/**
 * Updates the sequence metadata with readiness information
 * This function should be called after any action that affects sequence readiness
 */
export async function updateSequenceReadinessMetadata(sequenceId: string) {
  try {
    // Fetch the sequence with all necessary relations
    const sequence = await prisma.sequence.findUnique({
      where: { id: sequenceId },
      include: {
        steps: true,
        businessHours: true,
        sequenceMailbox: true,
        _count: {
          select: {
            contacts: true,
          },
        },
      },
    });

    if (!sequence) {
      console.error(`Sequence not found: ${sequenceId}`);
      return null;
    }

    // Calculate readiness status
    const hasSteps = sequence.steps.length > 0;
    const hasContacts = sequence._count.contacts > 0;
    const hasBusinessHours = !!sequence.businessHours;
    const hasMailbox = !!sequence.sequenceMailbox;

    // Prepare metadata object
    const currentMetadata = sequence.metadata
      ? { ...(sequence.metadata as object) }
      : {};

    const updatedMetadata = {
      ...currentMetadata,
      readiness: {
        hasSteps,
        hasContacts,
        hasBusinessHours,
        hasMailbox,
        lastUpdated: new Date().toISOString(),
      },
    };

    // Update sequence metadata
    const updatedSequence = await prisma.sequence.update({
      where: { id: sequenceId },
      data: {
        metadata: updatedMetadata,
      },
    });

    return updatedSequence.metadata;
  } catch (error) {
    console.error(`Error updating sequence metadata: ${error}`);
    return null;
  }
}

/**
 * Updates a specific readiness field in the sequence metadata
 * This is more efficient when you only need to update one field
 */
export async function updateSequenceReadinessField(
  sequenceId: string,
  field: "hasSteps" | "hasContacts" | "hasBusinessHours" | "hasMailbox",
  value: boolean
) {
  try {
    // Fetch current sequence metadata
    const sequence = await prisma.sequence.findUnique({
      where: { id: sequenceId },
      select: { metadata: true },
    });

    if (!sequence) {
      console.error(`Sequence not found: ${sequenceId}`);
      return null;
    }

    // Prepare metadata object
    const currentMetadata = sequence.metadata
      ? { ...(sequence.metadata as object) }
      : {};

    const currentReadiness = (currentMetadata as any).readiness || {};

    const updatedMetadata = {
      ...currentMetadata,
      readiness: {
        ...currentReadiness,
        [field]: value,
        lastUpdated: new Date().toISOString(),
      },
    };

    // Update sequence metadata
    const updatedSequence = await prisma.sequence.update({
      where: { id: sequenceId },
      data: {
        metadata: updatedMetadata,
      },
    });

    return updatedSequence.metadata;
  } catch (error) {
    console.error(`Error updating sequence metadata field: ${error}`);
    return null;
  }
}
