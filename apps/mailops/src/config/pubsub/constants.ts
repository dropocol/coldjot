export const PUBSUB_CONFIG = {
  // PubSub subscription name
  SUBSCRIPTION_NAME:
    process.env.PUBSUB_SUBSCRIPTION_NAME || "coldjot-subscription",

  // PubSub topic name
  TOPIC_NAME: process.env.PUBSUB_TOPIC_NAME || "coldjot-gmail-notification",

  // Push endpoint
  PUBSUB_AUDIENCE:
    process.env.PUBSUB_AUDIENCE ||
    "https://cobra-electric-thoroughly.ngrok-free.app/api/pubsub",

  // Maximum retries for failed message processing
  MAX_RETRIES: 3,

  // Backoff delay between retries (in seconds)
  BACKOFF_SECONDS: 60,

  // Maximum concurrent message processing
  MAX_CONCURRENT_MESSAGES: 10,

  // Message acknowledgment deadline (in seconds)
  ACK_DEADLINE_SECONDS: 60,

  // Maximum message size (in bytes)
  MAX_MESSAGE_SIZE: 10 * 1024 * 1024, // 10MB

  // JWT verification settings
  JWT: {
    ISSUER: "https://accounts.google.com",
    AUDIENCE: process.env.PUBSUB_AUDIENCE,
    ALGORITHMS: ["RS256"] as const,
  },

  // Error handling
  ERROR_HANDLING: {
    MAX_DEAD_LETTER_ATTEMPTS: 5,
    RETRY_CODES: ["UNAVAILABLE", "DEADLINE_EXCEEDED", "RESOURCE_EXHAUSTED"],
  },
} as const;

// PubSub message attributes
export const MESSAGE_ATTRIBUTES = {
  EMAIL_ADDRESS: "emailAddress",
  HISTORY_ID: "historyId",
  NOTIFICATION_TYPE: "notificationType",
} as const;

// PubSub error codes
export const PUBSUB_ERRORS = {
  INVALID_TOKEN: "invalid_token",
  EXPIRED_TOKEN: "expired_token",
  INVALID_CLAIM: "invalid_claim",
  RESOURCE_NOT_FOUND: "resource_not_found",
} as const;
