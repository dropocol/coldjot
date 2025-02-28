import { Sequence, SequenceStatus } from "@coldjot/types";

// Cache for sequence readiness status to avoid repeated calculations
type ReadinessCache = {
  [sequenceId: string]: {
    timestamp: number;
    result: SequenceReadinessResult;
  };
};

// Cache expiration time in milliseconds (5 minutes)
const CACHE_EXPIRATION = 5 * 60 * 1000;

// In-memory cache
const readinessCache: ReadinessCache = {};

// Type for the result of isSequenceReadyToLaunch
export type SequenceReadinessResult = {
  isReady: boolean;
  steps: {
    hasSteps: boolean;
    hasContacts: boolean;
    hasBusinessHours: boolean;
    hasMailbox: boolean;
  };
};

/**
 * Checks if a sequence has completed all setup steps and is ready to launch
 * Uses caching to avoid repeated calculations for the same sequence
 */
export const isSequenceReadyToLaunch = (
  sequence: Sequence | any
): SequenceReadinessResult => {
  console.log("sequence", sequence);

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

  // Check cache first
  const cachedResult = readinessCache[sequence.id];
  const now = Date.now();

  if (cachedResult && now - cachedResult.timestamp < CACHE_EXPIRATION) {
    return cachedResult.result;
  }

  // Check if sequence has steps
  const hasSteps = Array.isArray(sequence.steps) && sequence.steps.length > 0;

  // Check if sequence has contacts
  const hasContacts = sequence._count?.contacts
    ? sequence._count.contacts > 0
    : (sequence.contactCount || 0) > 0;

  // Check if business hours are set - more robust check
  const hasBusinessHours = !!sequence.businessHours;

  // Check if mailbox is attached
  const hasMailbox = !!sequence.mailboxId || !!sequence.sequenceMailbox;

  const isReady = hasSteps && hasContacts && hasBusinessHours && hasMailbox;

  // Store result in cache
  const result = {
    isReady,
    steps: {
      hasSteps,
      hasContacts,
      hasBusinessHours,
      hasMailbox,
    },
  };

  readinessCache[sequence.id] = {
    timestamp: now,
    result,
  };

  return result;
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
  const completedSteps = Object.values(steps).filter(Boolean).length;
  const completionPercentage = Math.round((completedSteps / totalSteps) * 100);

  return {
    completedSteps,
    totalSteps,
    completionPercentage,
  };
};

/**
 * Invalidates the cache for a specific sequence
 * Call this when a sequence is updated
 */
export const invalidateSequenceCache = (sequenceId: string): void => {
  delete readinessCache[sequenceId];
};

/**
 * Invalidates the entire cache
 * Call this when multiple sequences might have been updated
 */
export const invalidateAllSequenceCache = (): void => {
  Object.keys(readinessCache).forEach((key) => {
    delete readinessCache[key];
  });
};
