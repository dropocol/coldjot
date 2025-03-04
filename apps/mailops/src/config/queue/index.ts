import { QueueOptions, WorkerOptions } from "bullmq";
import { REDIS_PREFIX } from "../redis/keys";

// Queue prefix configuration
const QUEUE_PREFIX = REDIS_PREFIX;

// Queue names with their actual queue identifiers
export const QUEUE_NAMES = {
  EMAIL: "email-sending",
  SEQUENCE: "sequence-processing",
  THREAD_WATCHER: "thread-watcher",
  CONTACT: "contact-processing",
  EMAIL_SCHEDULE: "email-schedule",
  LIST_SYNC: "list-sync",
} as const;

export type QueueName = keyof typeof QUEUE_NAMES;

// Job attempts per queue type
export const JOB_ATTEMPTS = {
  SEQUENCE: 3,
  EMAIL: 2,
  THREAD: 3,
  CONTACT: 3,
  EMAIL_SCHEDULE: 2,
  LIST_SYNC: 3,
} as const;

// Retry delays in milliseconds
export const RETRY_DELAYS = {
  SEQUENCE: 1000, // 1 second
  EMAIL: 1000, // 1 second
  THREAD: 1000, // 1 second
  CONTACT: 1000, // 1 second
  EMAIL_SCHEDULE: 1000, // 1 second
  LIST_SYNC: 5000, // 5 seconds
} as const;

// Retry configurations with backoff strategies
export const RETRY_OPTIONS = {
  SEQUENCE: {
    attempts: JOB_ATTEMPTS.SEQUENCE,
    backoff: {
      type: "exponential" as const,
      delay: RETRY_DELAYS.SEQUENCE,
    },
  },
  EMAIL: {
    attempts: JOB_ATTEMPTS.EMAIL,
    backoff: {
      type: "exponential" as const,
      delay: RETRY_DELAYS.EMAIL,
    },
  },
  THREAD: {
    attempts: JOB_ATTEMPTS.THREAD,
    backoff: {
      type: "exponential" as const,
      delay: RETRY_DELAYS.THREAD,
    },
  },
  CONTACT: {
    attempts: JOB_ATTEMPTS.CONTACT,
    backoff: {
      type: "exponential" as const,
      delay: RETRY_DELAYS.CONTACT,
    },
  },
  EMAIL_SCHEDULE: {
    attempts: JOB_ATTEMPTS.EMAIL_SCHEDULE,
    backoff: {
      type: "exponential" as const,
      delay: RETRY_DELAYS.EMAIL_SCHEDULE,
    },
  },
  LIST_SYNC: {
    attempts: JOB_ATTEMPTS.LIST_SYNC,
    backoff: {
      type: "exponential" as const,
      delay: RETRY_DELAYS.LIST_SYNC,
    },
  },
} as const;

// Cleanup settings
export const CLEANUP_AGE = 24 * 60 * 60 * 1000; // 24 hours

// Omit connection from QueueOptions as it will be provided by the service manager
export type QueueConfig = Omit<QueueOptions, "connection">;

// Default queue options with cleanup settings
export const DEFAULT_QUEUE_OPTIONS: QueueConfig = {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 100,
    },
    removeOnComplete: {
      age: CLEANUP_AGE,
      count: 100,
    },
    removeOnFail: {
      age: CLEANUP_AGE,
      count: 100,
    },
  },
};

// Queue-specific options that override defaults
export const QUEUE_OPTIONS: Partial<Record<QueueName, QueueConfig>> = {
  EMAIL: {
    defaultJobOptions: {
      ...DEFAULT_QUEUE_OPTIONS.defaultJobOptions,
      ...RETRY_OPTIONS.EMAIL,
    },
  },
  SEQUENCE: {
    defaultJobOptions: {
      ...DEFAULT_QUEUE_OPTIONS.defaultJobOptions,
      ...RETRY_OPTIONS.SEQUENCE,
    },
  },
  THREAD_WATCHER: {
    defaultJobOptions: {
      ...DEFAULT_QUEUE_OPTIONS.defaultJobOptions,
      ...RETRY_OPTIONS.THREAD,
      backoff: {
        type: "fixed",
        delay: 15000, // 15 seconds delay between retries
      },
    },
  },
  CONTACT: {
    defaultJobOptions: {
      ...DEFAULT_QUEUE_OPTIONS.defaultJobOptions,
      ...RETRY_OPTIONS.CONTACT,
    },
  },
  EMAIL_SCHEDULE: {
    defaultJobOptions: {
      ...DEFAULT_QUEUE_OPTIONS.defaultJobOptions,
      ...RETRY_OPTIONS.EMAIL_SCHEDULE,
    },
  },
  LIST_SYNC: {
    defaultJobOptions: {
      ...DEFAULT_QUEUE_OPTIONS.defaultJobOptions,
      ...RETRY_OPTIONS.LIST_SYNC,
    },
  },
};

// Processor concurrency settings
export const PROCESSOR_CONCURRENCY = {
  EMAIL: 5,
  SEQUENCE: 3,
  THREAD_WATCHER: 2,
  CONTACT: 5,
  EMAIL_SCHEDULE: 3,
  LIST_SYNC: 5,
} as const;

export const PROCESSOR_CONFIG = {
  [QUEUE_NAMES.EMAIL]: {
    worker: {
      prefix: QUEUE_PREFIX.slice(0, -1),
      concurrency: 10,
      limiter: {
        max: 50,
        duration: 1000,
      },
      connection: {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      },
    },
    rateLimits: {
      maxPerSecond: 50,
      maxPerMinute: 500,
    },
    queueOptions: {
      prefix: QUEUE_PREFIX.slice(0, -1),
      removeOnComplete: {
        count: 1000,
        age: 24 * 60 * 60,
      },
      removeOnFail: {
        count: 5000,
        age: 7 * 24 * 60 * 60,
      },
    },
  },
  [QUEUE_NAMES.SEQUENCE]: {
    worker: {
      prefix: QUEUE_PREFIX.slice(0, -1),
      concurrency: 5,
      limiter: {
        max: 100,
        duration: 1000,
      },
      connection: {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      },
    },
    rateLimits: {
      maxPerSecond: 100,
      maxPerMinute: 1000,
    },
    queueOptions: {
      prefix: QUEUE_PREFIX.slice(0, -1),
      removeOnComplete: {
        count: 1000,
        age: 24 * 60 * 60,
      },
      removeOnFail: {
        count: 5000,
        age: 7 * 24 * 60 * 60,
      },
    },
  },
  [QUEUE_NAMES.THREAD_WATCHER]: {
    worker: {
      prefix: QUEUE_PREFIX.slice(0, -1),
      concurrency: 10,
      limiter: {
        max: 50,
        duration: 1000,
      },
      connection: {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      },
    },
    rateLimits: {
      maxPerSecond: 50,
      maxPerMinute: 1000,
    },
    queueOptions: {
      prefix: QUEUE_PREFIX.slice(0, -1),
      removeOnComplete: {
        count: 1000,
        age: 24 * 60 * 60,
      },
      removeOnFail: {
        count: 5000,
        age: 7 * 24 * 60 * 60,
      },
    },
  },
  [QUEUE_NAMES.CONTACT]: {
    worker: {
      prefix: QUEUE_PREFIX.slice(0, -1),
      concurrency: 5,
      limiter: {
        max: 100,
        duration: 1000,
      },
      connection: {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      },
    },
    rateLimits: {
      maxPerSecond: 100,
      maxPerMinute: 1000,
    },
    queueOptions: {
      prefix: QUEUE_PREFIX.slice(0, -1),
      removeOnComplete: {
        count: 1000,
        age: 24 * 60 * 60,
      },
      removeOnFail: {
        count: 5000,
        age: 7 * 24 * 60 * 60,
      },
    },
  },
  [QUEUE_NAMES.EMAIL_SCHEDULE]: {
    worker: {
      prefix: QUEUE_PREFIX.slice(0, -1),
      concurrency: 5,
      limiter: {
        max: 100,
        duration: 1000,
      },
      connection: {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      },
    },
    rateLimits: {
      maxPerSecond: 100,
      maxPerMinute: 1000,
    },
    queueOptions: {
      prefix: QUEUE_PREFIX.slice(0, -1),
      removeOnComplete: {
        count: 1000,
        age: 24 * 60 * 60,
      },
      removeOnFail: {
        count: 5000,
        age: 7 * 24 * 60 * 60,
      },
    },
  },
  [QUEUE_NAMES.LIST_SYNC]: {
    worker: {
      prefix: QUEUE_PREFIX.slice(0, -1),
      concurrency: 5,
      limiter: {
        max: 50,
        duration: 1000,
      },
      connection: {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      },
    },
    rateLimits: {
      maxPerSecond: 50,
      maxPerMinute: 500,
    },
    queueOptions: {
      prefix: QUEUE_PREFIX.slice(0, -1),
      removeOnComplete: {
        count: 1000,
        age: 24 * 60 * 60,
      },
      removeOnFail: {
        count: 5000,
        age: 7 * 24 * 60 * 60,
      },
    },
  },
} as const;

// Helper functions
export function getWorkerOptions(processorName: string): WorkerOptions {
  return PROCESSOR_CONFIG[processorName as keyof typeof PROCESSOR_CONFIG]
    .worker;
}

export function getRateLimits(processorName: string) {
  return PROCESSOR_CONFIG[processorName as keyof typeof PROCESSOR_CONFIG]
    .rateLimits;
}

export function getQueueOptions(processorName: string) {
  return PROCESSOR_CONFIG[processorName as keyof typeof PROCESSOR_CONFIG]
    .queueOptions;
}

// Export types for type safety
export type JobAttempts = typeof JOB_ATTEMPTS;
export type RetryDelays = typeof RETRY_DELAYS;
export type ProcessorConcurrency = typeof PROCESSOR_CONCURRENCY;
