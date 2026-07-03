import { z } from "zod";

// Next.js loads .env* automatically; no dotenv.config() call needed.
//
// This schema is parsed at module load (boot). A missing/empty REQUIRED secret
// crashes the process immediately instead of failing later at first use.
// Mark a var `.optional()` only if the app can legitimately boot without it
// (e.g. feature flags, dev-only integrations).

const envSchema = z.object({
  // --- Runtime ---
  LOG_LEVEL: z.string().optional().default("info"),
  NODE_ENV: z.string().optional().default("development"),
  APP_ENV: z.string().optional().default("development"),
  NEXT_PUBLIC_APP_ENV: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().optional(),

  // --- Required secrets (boot fails without these) ---
  // NextAuth reads NEXTAUTH_SECRET / NEXTAUTH_URL directly from process.env,
  // but we validate presence here so a misconfigured deploy fails fast.
  NEXTAUTH_SECRET: z.string().min(16, "NEXTAUTH_SECRET must be at least 16 chars"),
  NEXTAUTH_URL: z.string().url().optional(),
  ENCRYPTION_KEY: z.string().min(16, "ENCRYPTION_KEY must be at least 16 chars"),
  // Shared secret with mailops (must match SERVICE_INTERNAL_TOKEN); sent as
  // X-Service-Token on every internal call.
  MAILOPS_SERVICE_TOKEN: z.string().min(16),

  // --- Database ---
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // --- Google OAuth2 (sign-in) ---
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string(),

  // --- Google Mailbox OAuth2 (Gmail send/read) ---
  GOOGLE_CLIENT_ID_EMAIL: z.string().min(1),
  GOOGLE_CLIENT_SECRET_EMAIL: z.string().min(1),
  GOOGLE_REDIRECT_URI_EMAIL: z.string(),

  // --- Mailops API ---
  NEXT_PUBLIC_MAILOPS_API_URL: z
    .string()
    .optional()
    .default("http://localhost:3001/api"),

  // --- Optional integrations / feature flags ---
  AUTH_URL: z.string().optional(),
  TRACK_API_URL: z.string().optional(),
  PUBSUB_AUDIENCE: z.string().optional(),
  APOLLO_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY_DEV: z.string().optional(),
  EMAIL_DOMAIN: z.string().optional(),
  TEST_MODE: z.string().optional(),
  NEXT_PUBLIC_ENABLE_WATCH_CONTROLS: z.string().optional(),
});

export const env = envSchema.parse(process.env);
