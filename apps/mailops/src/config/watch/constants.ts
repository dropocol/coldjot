export const WATCH_CONFIG = {
  // ======== DEVELOPMENT SETTINGS ========
  // These settings are only used in development mode for testing
  // Set WATCH_DEV_MODE=true to enable these settings
  DEV: {
    // Enable development mode (faster cleanup cycles and shorter renewal buffer)
    ENABLED:
      process.env.WATCH_DEV_MODE === "true" ||
      process.env.NODE_ENV === "development",

    // How often to run the cleanup service in development (in minutes)
    CLEANUP_INTERVAL_MINUTES: 1,

    // How soon before expiration to renew watches in development (in minutes)
    RENEWAL_BUFFER_MINUTES: 5,

    // For testing: artificially set watch expiration to this many minutes in the future
    DEFAULT_EXPIRATION_MINUTES: 10,

    // For testing: log additional debug information
    VERBOSE_LOGGING: true,
  },

  // Watch renewal buffer (24 hours before expiration)
  RENEWAL_BUFFER_HOURS: 24,

  // Watch cleanup interval (every 6 hours)
  CLEANUP_INTERVAL_HOURS: 6,

  // Maximum watch duration (7 days as per Gmail API limits)
  MAX_WATCH_DAYS: 7,

  // PubSub topic for notifications
  TOPIC_NAME: process.env.PUBSUB_TOPIC_NAME || "coldjot-gmail-notification",

  // Labels to watch for changes
  LABEL_IDS: ["INBOX", "SENT", "SPAM"],

  // Maximum retries for watch operations
  MAX_RETRIES: 3,

  // Backoff delay for retries (in milliseconds)
  RETRY_DELAY_MS: 1000,

  // Maximum concurrent watch operations
  MAX_CONCURRENT_OPERATIONS: 5,
} as const;

export const WATCH_ERRORS = {
  INVALID_GRANT: "invalid_grant",
  TOKEN_EXPIRED: "token_expired",
  RATE_LIMIT: "rate_limit_exceeded",
  WATCH_EXPIRED: "watch_expired",
  INVALID_SCOPE: "invalid_scope",
} as const;

// Gmail API endpoints
export const GMAIL_API = {
  WATCH: "https://gmail.googleapis.com/gmail/v1/users/me/watch",
  STOP: "https://gmail.googleapis.com/gmail/v1/users/me/stop",
  HISTORY: "https://gmail.googleapis.com/gmail/v1/users/me/history",
} as const;

// Required Gmail API scopes
export const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.metadata",
] as const;
