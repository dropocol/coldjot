import { Router } from "express";
import sequenceRoutes from "./sequence";
import healthRoutes from "./health";
import metricsRoutes from "./metrics";
import trackingRoutes from "./tracking";

import pubsubRouter from "./pubsub";
import mailboxRouter from "./mailbox";

const router = Router();

// Mount route modules
router.use("/sequences", sequenceRoutes);
router.use("/health", healthRoutes);
router.use("/metrics", metricsRoutes);
router.use("/track", trackingRoutes);

// router.use("/pubsub", pubsubRouter);
// router.use("/mailbox", mailboxRouter);

export default router;
