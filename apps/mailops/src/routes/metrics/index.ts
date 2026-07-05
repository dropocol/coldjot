import { Router } from "express";
import { send } from "@/controllers/utils";
import type { createMetricsController } from "@/controllers/metrics.controller";

type MetricsController = ReturnType<typeof createMetricsController>;

/** Phase 6.4: route factory takes the controller. */
export function makeMetricsRouter(controller: MetricsController): Router {
  const router = Router();

  // Metrics routes
  router.get("/", async (req, res) =>
    send(res, await controller.getSystemMetrics())
  );
  router.get("/sequences/:id/health", async (req, res) =>
    send(res, await controller.getSequenceHealth(String(req.params.id)))
  );

  return router;
}
