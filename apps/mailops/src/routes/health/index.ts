import { Router } from "express";
import * as controller from "@/controllers/health.controller";
import { send } from "@/controllers/utils";

const router = Router();

// Health check routes
router.get("/", async (req, res) => send(res, await controller.checkHealth()));
router.get("/check", async (req, res) =>
  send(res, await controller.checkHealthSimple())
);
router.get("/queues/status", async (req, res) =>
  send(res, await controller.getQueueStatus())
);

export default router;
