import express from "express";
import * as controller from "@/controllers/list.controller";
import { send } from "@/controllers/utils";

const router = express.Router();

// Create a sync record for a list
router.post("/:listId/sync", async (req, res) => {
  const result = await controller.createSyncRecord(
    String(req.params.listId),
    req.body
  );
  return send(res, result);
});

export default router;
