import { Router } from "express";
import { send } from "@/controllers/utils";
import type { createHealthController } from "@/controllers/health.controller";

type HealthController = ReturnType<typeof createHealthController>;

/** Phase 6.4: route factory takes the controller. */
export function makeHealthRouter(controller: HealthController): Router {
  const router = Router();

  // Health check routes
  router.get("/", async (req, res) => send(res, await controller.checkHealth()));
  router.get("/check", async (req, res) =>
    send(res, await controller.checkHealthSimple())
  );
  router.get("/queues/status", async (req, res) =>
    send(res, await controller.getQueueStatus())
  );

  return router;
}
