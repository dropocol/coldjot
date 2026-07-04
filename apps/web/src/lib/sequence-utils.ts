import {
  Sequence,
  SequenceStatus,
  type SequenceReadinessMetadata,
  type SequenceReadinessResult,
} from "@coldjot/types";

const DEFAULT_READINESS: SequenceReadinessMetadata = {
  hasSteps: false,
  hasContacts: false,
  hasBusinessHours: false,
  hasMailbox: false,
};

const READY_READINESS: SequenceReadinessMetadata = {
  hasSteps: true,
  hasContacts: true,
  hasBusinessHours: true,
  hasMailbox: true,
};

/** Narrow a sequence's JSON metadata blob into the readiness shape (or default). */
function getReadiness(sequence: Sequence): SequenceReadinessMetadata {
  const readiness = sequence.metadata?.readiness;
  if (readiness && typeof readiness === "object") {
    return { ...DEFAULT_READINESS, ...(readiness as Partial<SequenceReadinessMetadata>) };
  }
  return DEFAULT_READINESS;
}

/**
 * Checks if a sequence is ready to launch based on its metadata
 * If metadata is not available, returns a default result
 */
export const isSequenceReadyToLaunch = (
  sequence: Sequence
): SequenceReadinessResult => {
  // Skip checks for active or paused sequences
  if (
    sequence.status === SequenceStatus.ACTIVE ||
    sequence.status === SequenceStatus.PAUSED
  ) {
    return {
      isReady: true,
      steps: READY_READINESS,
    };
  }

  const readinessData = getReadiness(sequence);

  // Check if all steps are completed
  const isReady =
    readinessData.hasSteps &&
    readinessData.hasContacts &&
    readinessData.hasBusinessHours &&
    readinessData.hasMailbox;

  return {
    isReady,
    steps: readinessData,
  };
};

/**
 * Calculates the completion percentage of sequence setup
 */
export const getSequenceSetupProgress = (
  sequence: Sequence
): {
  completedSteps: number;
  totalSteps: number;
  completionPercentage: number;
} => {
  const { steps } = isSequenceReadyToLaunch(sequence);

  const totalSteps = 4; // Total number of setup steps
  const completedSteps = (
    Object.entries(steps) as [string, boolean | string | undefined][]
  ).filter(([key, value]) => key !== "lastUpdated" && value).length;
  const completionPercentage = Math.round((completedSteps / totalSteps) * 100);

  return {
    completedSteps,
    totalSteps,
    completionPercentage,
  };
};

/**
 * Determines if the sequence metadata needs to be updated
 * Returns true if metadata is missing or outdated
 */
export const shouldUpdateSequenceMetadata = (
  sequence: Sequence
): boolean => {
  const readiness = sequence.metadata?.readiness;
  // If no metadata or no readiness data, update is needed
  if (!readiness || typeof readiness !== "object") {
    return true;
  }

  // If last update was more than 5 minutes ago, update is needed
  const lastUpdated = (readiness as SequenceReadinessMetadata).lastUpdated;
  if (!lastUpdated) {
    return true;
  }

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  return lastUpdated < fiveMinutesAgo;
};

/**
 * Updates the sequence metadata on the client side
 * This should be called after any action that might affect sequence readiness
 */
export const updateSequenceMetadata = async (
  sequenceId: string
): Promise<Record<string, unknown> | null> => {
  try {
    const response = await fetch(`/api/sequences/${sequenceId}/metadata`, {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error("Failed to update sequence metadata");
    }

    const data = (await response.json()) as { metadata?: Record<string, unknown> };
    return data.metadata ?? null;
  } catch (error) {
    console.error("Error updating sequence metadata:", error);
    return null;
  }
};

/**
 * Updates a local sequence object with the latest metadata
 * This is useful for updating the UI without a full page reload
 */
export const updateLocalSequenceWithMetadata = (
  sequence: Sequence,
  metadata: Record<string, unknown>
): Sequence => {
  if (!sequence) return sequence;

  return {
    ...sequence,
    metadata: {
      ...(sequence.metadata || {}),
      ...metadata,
    },
  };
};
