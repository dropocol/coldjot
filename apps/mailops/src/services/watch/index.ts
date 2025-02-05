import { logger } from "@/lib/log";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { prisma } from "@coldjot/database";
import { nanoid } from "nanoid";
import {
  GMAIL_API,
  WATCH_CONFIG,
  WATCH_ERRORS,
} from "../../config/watch/constants";
import { WatchResponse, WatchError, WatchErrorCode } from "../../types/watch";
import { backOff, type BackoffOptions } from "exponential-backoff";
import { PubSub } from "@google-cloud/pubsub";
import { refreshTokenIfNeeded } from "@/lib/google/gmail/helper";

interface GmailErrorResponse {
  error: {
    code: number;
    message: string;
    status: string;
    details?: Array<{
      "@type": string;
      reason: string;
      domain: string;
      metadata: {
        service: string;
        consumer: string;
      };
    }>;
  };
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
}

interface WatchSetupParams {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
}

export class WatchService {
  private pubSubClient: PubSub;
  private oauth2Client: OAuth2Client;

  constructor() {
    this.pubSubClient = new PubSub({
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
    });

    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID_EMAIL,
      process.env.GOOGLE_CLIENT_SECRET_EMAIL,
      process.env.GOOGLE_REDIRECT_URI_EMAIL
    );
  }

  private async createWatchRequest(
    accessToken: string
  ): Promise<WatchResponse> {
    const response = await fetch(GMAIL_API.WATCH, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        labelIds: WATCH_CONFIG.LABEL_IDS,
        topicName: WATCH_CONFIG.TOPIC_NAME,
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as GmailErrorResponse;
      throw {
        code: errorData.error?.code || "unknown_error",
        message: errorData.error?.message || "Failed to create watch",
        status: response.status,
      } as WatchError;
    }

    const data = (await response.json()) as WatchResponse;
    return data;
  }

  private async setupGmailClient(
    accessToken: string,
    refreshToken?: string | null,
    expiresAt?: number | null
  ) {
    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken || undefined,
      expiry_date: expiresAt ? expiresAt * 1000 : undefined,
    });

    return google.gmail({ version: "v1", auth: this.oauth2Client });
  }

  async setupWatch({
    userId,
    email,
    accessToken,
    refreshToken,
    expiresAt,
  }: WatchSetupParams): Promise<void> {
    try {
      // Initialize Gmail API with the authenticated client
      const gmail = await this.setupGmailClient(
        accessToken,
        refreshToken,
        expiresAt
      );

      // Setup watch request
      const watchRequest = {
        userId: "me",
        requestBody: {
          // Don't specify labelIds to watch all labels
          topicName: `projects/${process.env.GOOGLE_CLOUD_PROJECT}/topics/${process.env.PUBSUB_TOPIC_NAME}`,
        },
      };

      // Attempt to setup watch
      const response = await gmail.users.watch(watchRequest);

      logger.info({ email, response: response.data }, "Watch setup completed");

      // Check for existing watch
      const existingWatch = await prisma.emailWatch.findUnique({
        where: { email },
      });

      if (existingWatch) {
        await prisma.emailWatch.update({
          where: { email },
          data: {
            historyId: response.data.historyId?.toString() || "0",
            expiration: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          },
        });
        logger.info({ email }, "Updated existing watch");
        return;
      }

      // Create new watch record
      const expiration = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
      await prisma.emailWatch.create({
        data: {
          id: nanoid(),
          userId,
          email,
          historyId: response.data.historyId?.toString() || "0",
          expiration,
        },
      });

      logger.info({ email }, "Successfully setup watch for email");
    } catch (error) {
      const watchError = error as WatchError;
      logger.error(
        {
          error: {
            message: watchError.message,
            code: watchError.code,
            status: watchError.status,
          },
          email,
        },
        "Failed to setup watch"
      );
      throw new Error(`Failed to setup Gmail watch: ${watchError.message}`);
    }
  }

  async renewWatch(watchId: string): Promise<void> {
    try {
      const watch = await prisma.emailWatch.findUnique({
        where: { id: watchId },
      });

      if (!watch) {
        throw new Error(`Watch not found: ${watchId}`);
      }

      // Get access token from mailbox
      const accessToken = await this.getAccessToken(watch.email);
      if (!accessToken) {
        throw new Error(`No access token found for mailbox: ${watch.email}`);
      }

      // Create new watch
      const watchResponse = await this.createWatchRequest(accessToken);

      // Update expiration
      const expiration = new Date();
      expiration.setDate(expiration.getDate() + WATCH_CONFIG.MAX_WATCH_DAYS);

      await prisma.emailWatch.update({
        where: { id: watchId },
        data: {
          historyId: watchResponse.historyId,
          expiration,
          updatedAt: new Date(),
        },
      });

      logger.info({ watchId }, "Successfully renewed watch");
    } catch (error) {
      logger.error({ error, watchId }, "Failed to renew watch");
      this.handleWatchError(error as WatchError);
    }
  }

  async stopWatch(email: string): Promise<void> {
    try {
      const watch = await prisma.emailWatch.findUnique({
        where: { email },
      });

      if (!watch) {
        logger.info({ email }, "No watch found to stop");
        return;
      }

      // Get the mailbox
      const mailbox = await prisma.mailbox.findFirst({
        where: {
          email,
          isActive: true,
          provider: "gmail",
        },
      });

      if (!mailbox || !mailbox.access_token) {
        logger.error(
          { email },
          "No active mailbox found or missing access token"
        );
        return;
      }

      // Initialize Gmail API with the authenticated client
      const gmail = await this.setupGmailClient(
        mailbox.access_token,
        mailbox.refresh_token,
        mailbox.expires_at
      );

      // Stop the watch
      await gmail.users.stop({ userId: "me" });

      // Delete the watch record
      await prisma.emailWatch.delete({
        where: { email },
      });

      logger.info({ email }, "Successfully stopped watch");
    } catch (error) {
      const watchError = error as WatchError;
      logger.error(
        {
          error: {
            message: watchError.message,
            code: watchError.code,
            status: watchError.status,
          },
          email,
        },
        "Failed to stop watch"
      );
      throw new Error(`Failed to stop Gmail watch: ${watchError.message}`);
    }
  }

  private handleWatchError(error: WatchError): never {
    switch (error.code) {
      case WatchErrorCode.INVALID_GRANT:
      case WatchErrorCode.TOKEN_EXPIRED:
        throw new Error(`Authentication error: ${error.message}`);
      case WatchErrorCode.RATE_LIMIT_EXCEEDED:
        throw new Error(`Rate limit exceeded: ${error.message}`);
      case WatchErrorCode.WATCH_EXPIRED:
        throw new Error(`Watch expired: ${error.message}`);
      default:
        throw new Error(`Watch operation failed: ${error.message}`);
    }
  }

  private async getAccessToken(email: string): Promise<string | null> {
    try {
      // Get the mailbox
      const mailbox = await prisma.mailbox.findFirst({
        where: {
          email: email,
          isActive: true,
          provider: "gmail",
        },
      });

      if (!mailbox) {
        logger.error({ email }, "No active Google mailbox found");
        return null;
      }

      if (
        !mailbox.access_token ||
        !mailbox.refresh_token ||
        !mailbox.expires_at
      ) {
        logger.error({ email }, "Missing required tokens or expiry");
        return null;
      }

      // Use refreshTokenIfNeeded helper
      const accessToken = await refreshTokenIfNeeded({
        userId: mailbox.userId,
        mailboxId: mailbox.id,
        accessToken: mailbox.access_token,
        refreshToken: mailbox.refresh_token,
        expiryDate: mailbox.expires_at,
      });

      return accessToken;
    } catch (error) {
      logger.error({ error, email }, "Failed to get access token");
      return null;
    }
  }
}
