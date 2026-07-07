import { z } from "zod";
import { config } from "dotenv";
import path from "path";

const APP_ENV = process.env.APP_ENV || "development";

// Load environment variables from env directory
config({ path: path.resolve(process.cwd(), "env/.env") });
config({ path: path.resolve(process.cwd(), `env/.env.${APP_ENV}`) });
config({ path: path.resolve(process.cwd(), "env/.env.local") });
config({ path: path.resolve(process.cwd(), `env/.env.${APP_ENV}.local`) });

// Schema for environment variables
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Redis
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.string().default("6379"),
  REDIS_PASSWORD: z.string().optional(),

  // Queue
  QUEUE_PREFIX: z.string().default("coldjot"),

  // General
  LOG_LEVEL: z.string().default("info"),
  LOG_SHOW_TIME: z.boolean().default(false),
  LOG_PATH_DEPTH: z.coerce.number().default(0),
  NODE_ENV: z.string().default("development"),
  APP_ENV: z.string().default("development"),
  WEB_APP_URL: z.string().default("http://localhost:4000"),
  MAILOPS_API_URL: z.string().default("http://localhost:3001"),
  TRACK_API_URL: z.string().optional(),
  EMAIL_DOMAIN: z.string().optional(),
  BYPASS_BUSINESS_HOURS: z
    .string()
    .default("false")
    .transform((v) => v === "true"),

  // File Logging
  LOG_TO_FILE: z.boolean().default(false),
  LOG_DIR: z.string().default("logs"),

  // Service auth — shared secret with the web app. Required: if unset, the
  // service-auth middleware fails closed (rejects all internal requests).
  SERVICE_INTERNAL_TOKEN: z.string().min(16),

  // Field-encryption passphrase for OAuth tokens at rest. MUST match the web
  // app's ENCRYPTION_KEY: the web app encrypts tokens during Gmail login, and
  // mailops decrypts/re-encrypts them on every refresh. A mismatch (or missing
  // value) makes token persistence throw "ENCRYPTION_KEY is not set", which
  // surfaces as a send failure deep in the email processor. Validated here so
  // mailops fails fast at boot instead of mid-send.
  ENCRYPTION_KEY: z.string().min(16, "ENCRYPTION_KEY is required"),
  ENCRYPTION_KEY_OLD: z.string().optional(),

  // Google Mailbox OAuth2 (Gmail send/read). Required for sending mail.
  GOOGLE_CLIENT_ID_EMAIL: z.string().min(1, "GOOGLE_CLIENT_ID_EMAIL is required"),
  GOOGLE_CLIENT_SECRET_EMAIL: z
    .string()
    .min(1, "GOOGLE_CLIENT_SECRET_EMAIL is required"),
  GOOGLE_REDIRECT_URI_EMAIL: z.string(),

  // PubSub — set to "false" to disable the Google PubSub service entirely
  // (e.g. for local dev without GCP service-account credentials). When false,
  // PubSubService becomes a no-op stub: no client is constructed and no gRPC
  // calls are made, so mailops boots without GCP identity. Defaults to true
  // so production behavior is unchanged.
  // When ENABLED, the GOOGLE_CLOUD_PROJECT / service-account / topic vars below
  // are required.
  // NOTE: z.coerce.boolean() would parse "false" as true (Boolean("false")),
  // so we transform the string explicitly.
  MAILOPS_PUBSUB_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  GOOGLE_CLOUD_PROJECT: z.string().optional(),
  PUBSUB_TOPIC_NAME: z.string().optional(),
  PUBSUB_SUBSCRIPTION_NAME: z.string().optional(),
  PUBSUB_AUDIENCE: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  WATCH_DEV_MODE: z.string().optional(),

  // Optional alerting
  ALERT_EMAIL_TO: z.string().optional(),
});

// Parse and validate environment variables
const env = envSchema.parse(process.env);

export { env, APP_ENV };
