/**
 * Vitest setup — runs before any test module is imported.
 *
 * Phase 0 characterization tests run against unchanged production code. The
 * production modules validate env at import time (config/env.ts does a strict
 * zod parse), so we must populate process.env *before* the first import of
 * `@/config` or anything that transitively pulls it in (`@/lib/log`,
 * `@/lib/google`, etc.).
 *
 * Values are dummy test fixtures — characterization tests mock @coldjot/database
 * and googleapis, so no real DB/Redis/Gmail connection is ever made.
 */
process.env.NODE_ENV = "test";
process.env.APP_ENV = "test";

// Required by config/env.ts zod schema (min-length checks)
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";
process.env.SERVICE_INTERNAL_TOKEN = "test-token-at-least-16-chars-long";
process.env.GOOGLE_CLIENT_ID_EMAIL = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET_EMAIL = "test-client-secret";
process.env.GOOGLE_REDIRECT_URI_EMAIL = "http://localhost:3000/callback";

// Disable PubSub so importing services/pubsub/* doesn't try to construct a
// real @google-cloud/pubsub client.
process.env.MAILOPS_PUBSUB_ENABLED = "false";

// Optional but referenced by getBaseUrl() defaults
process.env.WEB_APP_URL = "http://localhost:4000";
process.env.MAILOPS_API_URL = "http://localhost:3001";
process.env.TRACK_API_URL = "http://localhost:3001";
