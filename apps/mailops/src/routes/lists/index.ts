import express from "express";
import { send } from "@/controllers/utils";
import type { createListController } from "@/controllers/list.controller";

type ListController = ReturnType<typeof createListController>;

/** Phase 6.4: route factory takes the controller. */
export function makeListsRouter(controller: ListController): express.Router {
  const router = express.Router();

  // Create a sync record for a list
  router.post("/:listId/sync", async (req, res) => {
    const result = await controller.createSyncRecord(
      String(req.params.listId),
      req.body
    );
    return send(res, result);
  });

  return router;
}
