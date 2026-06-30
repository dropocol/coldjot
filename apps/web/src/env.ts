import { z } from "zod";

// Next.js loads .env* automatically; no dotenv.config() call needed.

const envSchema = z.object({
  LOG_LEVEL: z.string().optional().default("info"),
  NODE_ENV: z.string().optional().default("development"),
  NEXT_PUBLIC_MAILOPS_API_URL: z
    .string()
    .optional()
    .default("http://localhost:3001/api"),
  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  GOOGLE_REDIRECT_URI: z.string(),
  // Shared secret with the mailops service (must match SERVICE_INTERNAL_TOKEN
  // in mailops). Sent as X-Service-Token on every internal call.
  MAILOPS_SERVICE_TOKEN: z.string().min(16),
});

export const env = envSchema.parse(process.env);
