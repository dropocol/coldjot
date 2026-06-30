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
  DATABASE_URL: z.string().min(1, "Database URL is required"),

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
  WEB_APP_URL: z.string().default("http://localhost:4000"),

  // File Logging
  LOG_TO_FILE: z.boolean().default(false),
  LOG_DIR: z.string().default("logs"),
  APP_ENV: z.string().default("development"),

  // Service auth — shared secret with the web app. Required: if unset, the
  // service-auth middleware fails closed (rejects all internal requests).
  SERVICE_INTERNAL_TOKEN: z.string().min(16),
});

// Parse and validate environment variables
const env = envSchema.parse(process.env);

export { env, APP_ENV };
