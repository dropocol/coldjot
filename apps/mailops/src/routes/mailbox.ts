import { Router } from "express";
import { WatchService } from "../services/watch";
import { logger } from "@/lib/log";
import { z } from "zod";
import { prisma } from "@coldjot/database";

const router = Router();
const watchService = new WatchService();

// Schema for mailbox watch setup
const MailboxWatchSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
});

/**
 * Setup watch for a mailbox
 * This should be called after a new mailbox is connected or when re-enabling a mailbox
 */
router.post("/watch", async (req, res) => {
  try {
    logger.info(
      { body: req.body, headers: req.headers },
      "Received mailbox watch setup request"
    );

    if (!req.body || Object.keys(req.body).length === 0) {
      logger.error("Empty request body received");
      return res.status(400).json({
        error: "Empty request body",
        message: "Request body must contain userId and email",
      });
    }

    // Validate request body
    const result = MailboxWatchSchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join(", ");

      logger.error(
        { error: result.error, errorMessage },
        "Invalid mailbox watch setup request"
      );
      return res.status(400).json({
        error: "Invalid request format",
        details: errorMessage,
      });
    }

    const { userId, email } = result.data;

    // Get the mailbox to verify it exists and is active
    const mailbox = await prisma.mailbox.findFirst({
      where: {
        userId,
        email,
        isActive: true,
        provider: "gmail",
      },
    });

    if (!mailbox) {
      logger.error({ userId, email }, "No active Gmail mailbox found for user");
      return res.status(404).json({
        error: "Mailbox not found or not active",
        message:
          "Please ensure the mailbox exists, is active, and is a Gmail account",
      });
    }

    if (!mailbox.access_token) {
      logger.error({ userId, email }, "Mailbox has no access token");
      return res.status(400).json({
        error: "Mailbox requires authentication",
        message: "The mailbox needs to be re-authenticated",
      });
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
    res.status(200).json({ message: "Watch setup successful" });
  } catch (error) {
    logger.error({ error }, "Failed to setup mailbox watch");
    res.status(500).json({
      error: "Failed to setup watch",
      message:
        error instanceof Error ? error.message : "Unknown error occurred",
    });
  }
});

/**
 * Stop watch for a mailbox
 * This should be called when removing a mailbox or disabling notifications
 */
router.delete("/watch/:email", async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    await watchService.stopWatch(email);
    res.status(200).json({ message: "Watch stopped successfully" });
  } catch (error) {
    logger.error({ error }, "Failed to stop mailbox watch");
    res.status(500).json({ error: "Failed to stop watch" });
  }
});

export default router;
