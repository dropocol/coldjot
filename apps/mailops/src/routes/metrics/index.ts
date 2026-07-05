import { Router } from "express";
import * as controller from "@/controllers/metrics.controller";
import { send } from "@/controllers/utils";

const router = Router();

// Metrics routes
router.get("/", async (req, res) =>
  send(res, await controller.getSystemMetrics())
);
router.get("/sequences/:id/health", async (req, res) =>
  send(res, await controller.getSequenceHealth(String(req.params.id)))
);

export default router;
