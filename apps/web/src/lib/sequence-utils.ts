import { Sequence, SequenceStatus } from "@coldjot/types";

// Type for the sequence readiness metadata
export type SequenceReadinessMetadata = {
  hasSteps: boolean;
  hasContacts: boolean;
  hasBusinessHours: boolean;
  hasMailbox: boolean;
  lastUpdated?: string; // ISO date string
};

// Type for the result of isSequenceReadyToLaunch
export type SequenceReadinessResult = {
  isReady: boolean;
  steps: SequenceReadinessMetadata;
};

/**
 * Checks if a sequence is ready to launch based on its metadata
 * If metadata is not available, returns a default result
 */
export const isSequenceReadyToLaunch = (
  sequence: Sequence | any
): SequenceReadinessResult => {
  // Skip checks for active or paused sequences
  if (
    sequence.status === SequenceStatus.ACTIVE ||
    sequence.status === SequenceStatus.PAUSED
  ) {
    return {
      isReady: true,
      steps: {
        hasSteps: true,
        hasContacts: true,
        hasBusinessHours: true,
        hasMailbox: true,
      },
    };
  }

  // Get readiness from metadata if available
  const metadata = sequence.metadata || {};
  const readinessData = metadata.readiness || {
    hasSteps: false,
    hasContacts: false,
    hasBusinessHours: false,
    hasMailbox: false,
  };

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
  sequence: Sequence | any
): {
  completedSteps: number;
  totalSteps: number;
  completionPercentage: number;
} => {
  const { steps } = isSequenceReadyToLaunch(sequence);

  const totalSteps = 4; // Total number of setup steps
  const completedSteps = Object.values(steps).filter(
    (step) => step && step !== steps.lastUpdated
  ).length;
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
  sequence: Sequence | any
): boolean => {
  // If no metadata or no readiness data, update is needed
  if (!sequence.metadata || !sequence.metadata.readiness) {
    return true;
  }

  // If last update was more than 5 minutes ago, update is needed
  const lastUpdated = sequence.metadata.readiness.lastUpdated;
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
): Promise<any> => {
  try {
    const response = await fetch(`/api/sequences/${sequenceId}/metadata`, {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error("Failed to update sequence metadata");
    }

    const data = await response.json();
    return data.metadata;
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
  sequence: any,
  metadata: any
): any => {
  if (!sequence) return sequence;

  return {
    ...sequence,
    metadata: {
      ...(sequence.metadata || {}),
      ...metadata,
    },
  };
};
