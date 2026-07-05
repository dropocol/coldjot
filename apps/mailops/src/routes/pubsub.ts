import { Router } from "express";
import type { InboxSyncService } from "@/services/domain/inbox-sync.service";
import { logger } from "@/lib/log";
import { pubSubMessageSchema as PubSubMessageSchema } from "@coldjot/types/pubsub";
import { verifyPubSubJwt } from "../lib/auth/pubsub";

/**
 * Phase 6.4: pubsub route factory takes the InboxSyncService (built by the
 * composition root). The eager `pubsubService.initialize()` call that lived at
 * module level is gone — `initializeApp()` owns PubSub startup now, so this
 * route no longer double-initializes it.
 */
export function makePubsubRouter(inboxSync: InboxSyncService): Router {
  const router = Router();

  // Health check endpoint
  router.get("/health", (req, res) => {
    res.status(200).json({ status: "healthy" });
  });

  // Push notification endpoint
  router.post("/", async (req, res) => {
    try {
      // Verify JWT from Authorization header BEFORE logging anything about the
      // request body — the body is untrusted until the signature is checked.
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

      logger.debug("Received verified PubSub push notification");

      // Validate request body
      const result = PubSubMessageSchema.safeParse(req.body);
      if (!result.success) {
        logger.error({ error: result.error }, "Invalid PubSub message format");
        return res.status(400).json({ error: "Invalid message format" });
      }

      // Process the notification
      // await inboxSync.handleNotification(result.data.message);
      await inboxSync.handleNotification(req.body.message);

      // Acknowledge the message by returning 200 OK
      res.status(200).send();
    } catch (error) {
      logger.error({ error }, "Failed to process PubSub notification");

      // Return 500 to trigger PubSub retry
      res.status(500).json({ error: "Processing failed" });
    }
  });

  return router;
}
