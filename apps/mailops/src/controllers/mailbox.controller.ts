import type { WatchService } from "@/services/watch";
import { logger } from "@/lib/log";
import { watchSetupSchema as MailboxWatchSchema } from "@coldjot/types/watch";
import type { MailboxRepository } from "@/repositories/mailbox.repo";
import {
  ok,
  badRequest,
  notFound,
  serverError,
  type ControllerResult,
} from "./utils";

/** Phase 6.4: mailbox controller is a factory (deps from composition root). */
export interface MailboxControllerDeps {
  watchService: WatchService;
  mailboxRepo: MailboxRepository;
}

export function createMailboxController(deps: MailboxControllerDeps) {
  const { watchService, mailboxRepo } = deps;

  /**
   * Setup watch for a mailbox
   * This should be called after a new mailbox is connected or when re-enabling a mailbox
   */
  async function setupWatch(body: unknown): Promise<ControllerResult> {
    try {
      // NOTE: never log req.headers here — it contains Authorization/cookies.
      logger.info("Received mailbox watch setup request");

      if (!body || typeof body !== "object" || Object.keys(body as object).length === 0) {
        logger.error("Empty request body received");
        return {
          status: 400,
          body: {
            error: "Empty request body",
            message: "Request body must contain userId and email",
          },
        } as ControllerResult;
      }

      // Validate request body
      const result = MailboxWatchSchema.safeParse(body);
      if (!result.success) {
        const errorMessage = result.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join(", ");

        logger.error(
          { error: result.error, errorMessage },
          "Invalid mailbox watch setup request"
        );
        return {
          status: 400,
          body: {
            error: "Invalid request format",
            details: errorMessage,
          },
        } as ControllerResult;
      }

      const { userId, email } = result.data;

      // Get the mailbox to verify it exists and is active
      const mailbox = await mailboxRepo.findActiveGmail(userId, email);

      if (!mailbox) {
        logger.error({ userId, email }, "No active Gmail mailbox found for user");
        return {
          status: 404,
          body: {
            error: "Mailbox not found or not active",
            message:
              "Please ensure the mailbox exists, is active, and is a Gmail account",
          },
        } as ControllerResult;
      }

      if (!mailbox.access_token) {
        logger.error({ userId, email }, "Mailbox has no access token");
        return {
          status: 400,
          body: {
            error: "Mailbox requires authentication",
            message: "The mailbox needs to be re-authenticated",
          },
        } as ControllerResult;
      }

      // First, attempt to stop any existing watch for this email
      try {
        logger.info(
          { email },
          "Attempting to stop any existing watch before setting up new one"
        );
        await watchService.stopWatch(email);
      } catch (error) {
        // Log the error but continue with setup - the error might just mean there was no watch to stop
        logger.warn(
          { error, email },
          "Error while stopping existing watch - proceeding with new watch setup"
        );
      }

      // Setup watch for the mailbox
      await watchService.setupWatch({
        userId,
        email,
        accessToken: mailbox.access_token,
        refreshToken: mailbox.refresh_token,
        expiresAt: mailbox.expires_at,
      });

      logger.info({ userId, email }, "Watch setup successful");
      return ok({ message: "Watch setup successful" });
    } catch (error) {
      logger.error({ error }, "Failed to setup mailbox watch");
      return {
        status: 500,
        body: {
          error: "Failed to setup watch",
          message:
            error instanceof Error ? error.message : "Unknown error occurred",
        },
      } as ControllerResult;
    }
  }

  /**
   * Stop watch for a mailbox
   * This should be called when removing a mailbox or disabling notifications
   */
  async function stopWatch(email: string): Promise<ControllerResult> {
    try {
      if (!email) {
        return badRequest("Email is required");
      }

      await watchService.stopWatch(email);
      return ok({ message: "Watch stopped successfully" });
    } catch (error) {
      logger.error({ error }, "Failed to stop mailbox watch");
      return serverError("Failed to stop watch");
    }
  }

  return { setupWatch, stopWatch };
}
