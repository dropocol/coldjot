import { Router } from "express";
import type { App } from "@/composition-root";
import { makeSequenceRouter } from "./sequence";
import { makeHealthRouter } from "./health";
import { makeMetricsRouter } from "./metrics";
import trackingRoutes from "./tracking";
import { makePubsubRouter } from "./pubsub";
import { makeMailboxRouter } from "./mailbox";
import { makeListsRouter } from "./lists";

/**
 * Phase 6.4: the top-level router is a factory that takes the App (built by
 * the composition root). Each sub-router receives the controller it needs.
 */
export function makeRouter(app: App): Router {
  const router = Router();

  router.use("/sequences", makeSequenceRouter(app.sequenceController));
  router.use("/health", makeHealthRouter(app.healthController));
  router.use("/metrics", makeMetricsRouter(app.metricsController));
  router.use("/track", trackingRoutes);
  router.use("/pubsub", makePubsubRouter(app.inboxSync));

  return router;
}
