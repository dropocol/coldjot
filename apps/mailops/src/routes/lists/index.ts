import express from "express";
import { prisma } from "@coldjot/database";
import { logger } from "@/lib/log";

const router = express.Router();

// Create a sync record for a list
router.post("/:listId/sync", async (req, res) => {
  try {
    const { listId } = req.params;
    const { sequenceId } = req.body;

    if (!listId) {
      return res.status(400).json({ error: "List ID is required" });
    }

    if (!sequenceId) {
      return res.status(400).json({ error: "Sequence ID is required" });
    }

    // Create a sync record that will be picked up by the watcher
    await prisma.listSyncRecord.create({
      data: {
        listId,
        sequenceId,
        status: "pending",
        contactsAdded: 0,
      },
    });

    logger.info({ listId, sequenceId }, "List sync record created");

    return res
      .status(200)
      .json({ success: true, message: "List sync record created" });
  } catch (error) {
    logger.error({ error }, "Failed to create list sync record");
    return res.status(500).json({ error: "Failed to create list sync record" });
  }
});

export default router;
