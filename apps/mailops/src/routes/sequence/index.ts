import { Router } from "express";
import { send } from "@/controllers/utils";
import {
  validateLaunch,
  validatePause,
  validateResume,
  validateReset,
} from "./validator";
import type { createSequenceController } from "@/controllers/sequence.controller";

type SequenceController = ReturnType<typeof createSequenceController>;

/** Phase 6.4: route factory takes the controller (built by the composition root). */
export function makeSequenceRouter(controller: SequenceController): Router {
  const router = Router();

  router.post("/:id/launch", validateLaunch, async (req, res) => {
    const result = await controller.launchSequence(
      String(req.params.id),
      req.body
    );
    return send(res, result);
  });
  router.post("/:id/pause", validatePause, async (req, res) => {
    const result = await controller.pauseSequence(String(req.params.id), req.body);
    return send(res, result);
  });
  router.post("/:id/resume", validateResume, async (req, res) => {
    const result = await controller.resumeSequence(String(req.params.id), req.body);
    return send(res, result);
  });
  router.post("/:id/reset", validateReset, async (req, res) => {
    const result = await controller.resetSequenceHandler(
      String(req.params.id),
      req.body
    );
    return send(res, result);
  });

  return router;
}
