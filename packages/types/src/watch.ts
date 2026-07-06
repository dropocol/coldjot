import { z } from "zod";

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const watchSetupSchema = z.object({
  userId: z.string(),
  email: z.email(),
});
export type WatchSetupParams = z.infer<typeof watchSetupSchema>;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WatchResponse {
  historyId: string;
  expiration: string;
}

export interface EmailWatch {
  id: string;
  userId: string;
  email: string;
  historyId: string;
  expiration: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface WatchError {
  code: string;
  message: string;
  status?: number;
}

export enum WatchErrorCode {
  INVALID_GRANT = "invalid_grant",
  TOKEN_EXPIRED = "token_expired",
  RATE_LIMIT_EXCEEDED = "rate_limit_exceeded",
  WATCH_EXPIRED = "watch_expired",
}

// ─── Repository record shapes (concrete DB columns) ─────────────────────────

export interface EmailWatchRecord {
  id: string;
  userId: string;
  email: string;
  historyId: string;
  expiration: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmailWatchHistoryRecord {
  id: string;
  emailWatchId: string;
  historyId: string;
  notificationType: string;
  processed: boolean;
  data: Record<string, unknown>;
}
