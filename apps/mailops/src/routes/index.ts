import { Router } from "express";
import type { App } from "@/composition-root";
import { makeSequenceRouter } from "./sequence";
import { makeHealthRouter } from "./health";
import { makeMetricsRouter } from "./metrics";
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
  // NOTE: /track and /pubsub are public routes and are mounted directly in
  // server.ts ABOVE the /api token gate. Do not re-mount them here — the
  // gated /api handler would run requireServiceToken on them and reject
  // tokenless browser/email-client requests with 401.

  return router;
}
