// Redis key prefix configuration
export const REDIS_PREFIX = "coldjot:" as const;
export const QUEUE_PREFIX = REDIS_PREFIX;

export enum RateLimitEnum {
  USER = "user",
  SEQUENCE = "sequence",
  CONTACT = "contact",
  COOLDOWN = "cooldown",
}

// TODO: Move to shared package
export const REDIS_KEYS = {
  // Rate limiting keys - In use
  // New flattened structure using hash maps instead of individual keys
  // This allows for better grouping and easier debugging
  rateLimits: {
    // Format: coldjot:ratelimit:{entityType}:{entityId}
    // Using Redis HASH to store all rate limit data for an entity
    user: (userId: string) => `${REDIS_PREFIX}ratelimit:user:${userId}`,
    sequence: (userId: string, sequenceId: string) =>
      `${REDIS_PREFIX}ratelimit:sequence:${userId}:${sequenceId}`,
    contact: (userId: string, _sequenceId: string, contactId: string) =>
      `${REDIS_PREFIX}ratelimit:contact:${contactId}`, // Simplified to just use contactId
    cooldown: (userId: string, _sequenceId: string, entityId: string) =>
      `${REDIS_PREFIX}ratelimit:cooldown:${entityId}`, // Generic cooldown for any entity
  },

  // Memory monitoring keys - In use
  memory: {
    metrics: () => `${REDIS_PREFIX}memory:metrics`,
    alerts: () => `${REDIS_PREFIX}memory:alerts`,
    config: () => `${REDIS_PREFIX}memory:config`,
  },

  // Queue keys
  queue: {
    job: (queueName: string, jobId: string) =>
      `${QUEUE_PREFIX}${queueName}:job:${jobId}`,
    status: (queueName: string) => `${QUEUE_PREFIX}${queueName}:status`,
    metrics: (queueName: string) => `${QUEUE_PREFIX}${queueName}:metrics`,
    progress: (queueName: string, jobId: string) =>
      `${QUEUE_PREFIX}${queueName}:job:${jobId}:progress`,
  },

  // Sequence keys
  sequence: {
    progress: (sequenceId: string, contactId: string) =>
      `${REDIS_PREFIX}sequence:${sequenceId}:contact:${contactId}:progress`,
    status: (sequenceId: string) =>
      `${REDIS_PREFIX}sequence:${sequenceId}:status`,
    metrics: (sequenceId: string) =>
      `${REDIS_PREFIX}sequence:${sequenceId}:metrics`,
  },

  // Contact keys
  contact: {
    sequence: (contactId: string) =>
      `${REDIS_PREFIX}contact:${contactId}:sequence`,
    status: (contactId: string) => `${REDIS_PREFIX}contact:${contactId}:status`,
    metrics: (contactId: string) =>
      `${REDIS_PREFIX}contact:${contactId}:metrics`,
  },

  // Email keys
  email: {
    thread: (emailId: string) => `${REDIS_PREFIX}email:${emailId}:thread`,
    status: (emailId: string) => `${REDIS_PREFIX}email:${emailId}:status`,
    metrics: (emailId: string) => `${REDIS_PREFIX}email:${emailId}:metrics`,
  },
} as const;

// Export types for better type safety
export type RateLimitType = RateLimitEnum;
