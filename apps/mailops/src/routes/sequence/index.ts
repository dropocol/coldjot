import { Router } from "express";
import * as controller from "@/controllers/sequence.controller";
import * as validator from "./validator";
import { send } from "@/controllers/utils";

const router = Router();

// Sequence routes
router.post(
  "/:id/launch",
  validator.validateLaunch,
  async (req, res) => {
    const result = await controller.launchSequence(
      String(req.params.id),
      req.body
    );
    return send(res, result);
  }
);
router.post(
  "/:id/pause",
  validator.validatePause,
  async (req, res) => {
    const result = await controller.pauseSequence(String(req.params.id), req.body);
    return send(res, result);
  }
);
router.post(
  "/:id/resume",
  validator.validateResume,
  async (req, res) => {
    const result = await controller.resumeSequence(String(req.params.id), req.body);
    return send(res, result);
  }
);
router.post(
  "/:id/reset",
  validator.validateReset,
  async (req, res) => {
    const result = await controller.resetSequenceHandler(
      String(req.params.id),
      req.body
    );
    return send(res, result);
  }
);

export default router;
