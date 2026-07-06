import { logger } from "@/lib/log";
import { PubSub } from "@google-cloud/pubsub";
import { PrismaMailboxRepository } from "@/repositories/prisma/prisma-mailbox.repo";
import { PrismaEmailWatchRepository } from "@/repositories/prisma/prisma-email-watch.repo";
import { nanoid } from "nanoid";
import { WATCH_CONFIG, WATCH_ERRORS } from "../../config/watch/constants";
import { WatchResponse, WatchError, WatchErrorCode } from "@coldjot/types";
import type { MailboxRepository } from "@/repositories/mailbox.repo";
import type { EmailWatchRepository } from "@/repositories/email-watch.repo";
import type { WatchGateway } from "@/adapters/watch-gateway";
import { GmailWatchGateway } from "@/adapters/watch-gateway";
import type { TokenRefresher } from "@/adapters/token-refresher";
import { GmailTokenRefresher } from "@/adapters/token-refresher";

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

// Note: GoogleTokenResponse + WATCH_ERRORS were imported but unused in the
// pre-refactor file; kept the surface minimal here.

interface WatchSetupParams {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
}

/**
 * Gmail mailbox watch lifecycle (setup / renew / stop).
 *
 * Phase 7: the Gmail REST surface (getProfile/stop/watch) and the token-refresh
 * path are now injected (`WatchGateway` + `TokenRefresher`), so this service is
 * testable without stubbing global `fetch` or constructing an OAuth2 client.
 * The constructor defaults to the live Gmail impls + Prisma repos, so existing
 * `new WatchService()` call sites (composition root, WatchCleanupService) keep
 * working unchanged.
 */
export class WatchService {
  private pubSubClient: PubSub;
  private readonly mailboxRepo: MailboxRepository;
  private readonly emailWatchRepo: EmailWatchRepository;
  private readonly gateway: WatchGateway;
  private readonly tokenRefresher: TokenRefresher;

  private TOPIC_NAME: string = `projects/${process.env.GOOGLE_CLOUD_PROJECT}/topics/${process.env.PUBSUB_TOPIC_NAME}`;

  constructor(
    gateway: WatchGateway = new GmailWatchGateway(),
    tokenRefresher: TokenRefresher = new GmailTokenRefresher(),
    mailboxRepo: MailboxRepository = new PrismaMailboxRepository(),
    emailWatchRepo: EmailWatchRepository = new PrismaEmailWatchRepository()
  ) {
    this.gateway = gateway;
    this.tokenRefresher = tokenRefresher;
    this.mailboxRepo = mailboxRepo;
    this.emailWatchRepo = emailWatchRepo;
    this.pubSubClient = new PubSub({
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
    });
  }

  async setupWatch({
    userId,
    email,
    accessToken,
  }: WatchSetupParams): Promise<void> {
    try {
      // First get the current history ID before stopping any existing watch
      const { historyId: currentHistoryId } =
        await this.gateway.getProfile(accessToken);

      logger.info(
        { email, currentHistoryId },
        "Retrieved current Gmail history ID"
      );

      // Stop any existing watch to prevent duplicate notifications
      try {
        await this.gateway.stop(accessToken);
        logger.info({ email }, "Stopped existing watch");
      } catch (error) {
        // Ignore errors from stop - it might not exist
        logger.debug(
          { error, email },
          "Error stopping existing watch - might not exist"
        );
      }

      // Setup watch request
      const response = await this.gateway.watch(accessToken, this.TOPIC_NAME);

      logger.info(
        {
          email,
          responseHistoryId: response.historyId,
          currentHistoryId,
        },
        "Watch setup completed"
      );

      // Set expiration to 6 days (slightly less than Gmail's 7 days)
      const expiration = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);

      // Use the current history ID instead of the watch response history ID
      // This ensures we don't miss any events that occurred during setup
      const historyId = currentHistoryId;

      // Check for existing watch
      const existingWatch = await this.emailWatchRepo.findByEmail(email);

      if (existingWatch) {
        await this.emailWatchRepo.updateByEmail(email, {
          historyId,
          expiration,
        });
        logger.info(
          { email, historyId, oldHistoryId: existingWatch.historyId },
          "Updated existing watch"
        );
        return;
      }

      // Create new watch record
      await this.emailWatchRepo.create({
        id: nanoid(),
        userId,
        email,
        historyId,
        expiration,
      });

      logger.info(
        { email, historyId },
        "Successfully setup new watch for email"
      );
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
      const watch = await this.emailWatchRepo.findById(watchId);

      if (!watch) {
        throw new Error(`Watch not found: ${watchId}`);
      }

      // Get access token from mailbox
      const accessToken = await this.getAccessToken(watch.email);
      if (!accessToken) {
        throw new Error(`No access token found for mailbox: ${watch.email}`);
      }

      // Create new watch
      const watchResponse = await this.gateway.createWatchRequest(accessToken);

      logger.info({ watchResponse }, "Watch response");

      // Update expiration
      const expiration = new Date();
      expiration.setDate(expiration.getDate() + WATCH_CONFIG.MAX_WATCH_DAYS);

      await this.emailWatchRepo.updateById(watchId, {
        historyId: watchResponse.historyId,
        expiration,
      });

      logger.info({ watchId }, "Successfully renewed watch");
    } catch (error) {
      logger.error({ error, watchId }, "Failed to renew watch");
      this.handleWatchError(error as WatchError);
    }
  }

  async stopWatch(email: string): Promise<void> {
    try {
      const watch = await this.emailWatchRepo.findByEmail(email);

      if (!watch) {
        logger.info({ email }, "No watch found to stop");
      }

      // Get the mailbox
      const mailbox = await this.mailboxRepo.findActiveGmailByEmail(email);

      if (!mailbox || !mailbox.access_token) {
        logger.error(
          { email },
          "No active mailbox found or missing access token"
        );
        return;
      }

      // Get a fresh access token (refresh if needed) then stop the watch.
      const accessToken = await this.getAccessToken(email);
      if (accessToken) {
        await this.gateway.stop(accessToken);
      }

      if (watch) {
        await this.emailWatchRepo.deleteByEmail(email);
      }

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
      const mailbox = await this.mailboxRepo.findActiveGmailByEmail(email);

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

      // Use the injected token refresher (refreshes when expired).
      const accessToken = await this.tokenRefresher.refreshIfNeeded({
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
