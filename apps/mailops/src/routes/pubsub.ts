import { Router } from "express";
import { PubSubService } from "../services/pubsub/client";
import { PubSubHandler } from "../services/pubsub/handler";
import { logger } from "@/lib/log";
import { z } from "zod";
import { verifyPubSubJwt } from "../lib/auth/pubsub";

const router = Router();
const pubsubService = PubSubService.getInstance();
const pubsubHandler = new PubSubHandler();

// Schema for PubSub push message
const PubSubMessageSchema = z.object({
  message: z.object({
    data: z.string(),
    messageId: z.string(),
    publishTime: z.string(),
    attributes: z.record(z.string()).optional(),
  }),
  subscription: z.string(),
});

// Initialize PubSub service when the router is created
pubsubService.initialize().catch((error) => {
  logger.error({ error }, "Failed to initialize PubSub service");
});

// Health check endpoint
router.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy" });
});

// Push notification endpoint
router.post("/", async (req, res) => {
  try {
    logger.info({ body: req.body }, "Received PubSub push notification");

    // Verify JWT from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      logger.error("Missing or invalid Authorization header");
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const isValid = await verifyPubSubJwt(token);
    if (!isValid) {
      logger.error("Invalid JWT token");
      return res.status(401).json({ error: "Unauthorized" });
    }

    logger.info(req.body, "Received PubSub notification body");

    // Validate request body
    const result = PubSubMessageSchema.safeParse(req.body);
    if (!result.success) {
      logger.error({ error: result.error }, "Invalid PubSub message format");
      return res.status(400).json({ error: "Invalid message format" });
    }

    // Process the notification
    // await pubsubHandler.handleNotification(result.data.message);
    await pubsubHandler.handleNotification(req.body.message);

    // Acknowledge the message by returning 200 OK
    res.status(200).send();
  } catch (error) {
    logger.error({ error }, "Failed to process PubSub notification");

    // Return 500 to trigger PubSub retry
    res.status(500).json({ error: "Processing failed" });
  }
});

export default router;
