// Environment
export * from "./env";

// Redis
export * from "./redis/keys";

// Queue
export * from "./queue/index";

// Rate Limit
export * from "./rate-limit/constants";

// Business Hours
export * from "./business/constants";

// Monitor
export * from "./monitor/constants";

// Contact Processing
export * from "./contact/constants";

// Memory Monitor
export * from "./memory/constants";

// Email Scheduling
export * from "./schedule/email";

// Development mode flag
export const isDevelopment =
  process.env.NODE_ENV === "development" ? true : false;

// Demo mode flag - will bypass business hours checks
export const BYPASS_BUSINESS_HOURS =
  process.env.BYPASS_BUSINESS_HOURS === "true" ? true : false;

// NOTE: a previous `export const env = { ... }` here shadowed the zod-validated
// `env` re-exported from ./env above. It was removed so consumers receive the
// fully-typed, boot-validated env (including WEB_APP_URL, SERVICE_INTERNAL_TOKEN,
// DATABASE_URL, REDIS_*, etc.) instead of this partial, unvalidated subset.
