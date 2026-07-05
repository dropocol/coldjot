import { Router } from "express";
import * as controller from "@/controllers/tracking.controller";

const router = Router();

// Email tracking routes
router.get("/:hash", controller.handleEmailOpen);
router.get("/:hash/click", controller.handleLinkClick);
router.post("/events", controller.trackEmailEvent);

export default router;
