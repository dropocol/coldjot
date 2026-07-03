import express from "express";
import cors from "cors";
import { logger } from "@/lib/log";
import pinoHttp from "pino-http";
import routes from "./routes";
import { createServiceManager } from "@/services/service-manager";
import pubsubRouter from "./routes/pubsub";
import mailboxRouter from "./routes/mailbox";
import listsRouter from "./routes/lists";
import { requireServiceToken } from "@/lib/auth/service-auth";
import { env } from "@/config";
import { mountBullBoard } from "@/lib/bull-board";

const app = express();
const port = 3001;
const serviceManager = createServiceManager();

// Initialize all services, then mount Bull-Board (which needs the queues).
serviceManager
  .initialize()
  .then(() => {
    try {
      const router = mountBullBoard(serviceManager);
      // Gate behind the shared service token (plan 03) so the queue admin UI
      // is reachable only from the web app / authenticated operators.
      app.use("/admin/queues", requireServiceToken, router);
      logger.info("📊 Bull-Board mounted at /admin/queues");
    } catch (error) {
      logger.error({ err: error }, "Failed to mount Bull-Board");
    }
  })
  .catch((error) => {
    logger.error("Failed to initialize services:", error);
    process.exit(1);
  });

// Middleware
// Restrict CORS to the known web origin(s) instead of reflecting any origin.
const allowedOrigins = env.WEB_APP_URL
  ? env.WEB_APP_URL.split(",").map((o) => o.trim()).filter(Boolean)
  : [];
app.use(
  cors({
    origin(origin, cb) {
      // Allow same-origin / server-to-server calls (no Origin header) and
      // any explicitly allowlisted origin.
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json());

// Add request logging
const httpLogger = pinoHttp({
  logger,
  customLogLevel: function (req, res, error) {
    if (error) return "error";
    if (res.statusCode >= 400 && res.statusCode < 500) return "warn";
    if (res.statusCode >= 500) return "error";
    return "info";
  },
  customSuccessMessage: function (req, res) {
    return `request completed with status ${res.statusCode}`;
  },
  customErrorMessage: function (req, res, error) {
    return `request failed with status ${res.statusCode}: ${error.message}`;
  },
});

app.use(httpLogger);

// Internal routes — require the shared service token. The web app must send
// X-Service-Token on every call. Public/webhook routes below are exempt.
app.use("/api", requireServiceToken, routes);
app.use("/api/mailbox", requireServiceToken, mailboxRouter);
app.use("/api/lists", requireServiceToken, listsRouter);

// Public/webhook routes — no service token; they have their own protections.
// PubSub verifies Google's signed JWT inside the route handler.
app.use("/pubsub", pubsubRouter); // Keep the /pubsub route for Gmail notifications
app.use("/api/pubsub", pubsubRouter); // Also mounted under /api for consistency

// Add specific error handling for PubSub routes.
// NOTE: do not always return 200 — that defeats PubSub retry semantics and
// masks auth failures. Let real errors return non-200 so PubSub retries.
app.use(
  "/pubsub",
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    logger.error({ error: err.message }, "PubSub notification error");
    const status = res.statusCode >= 400 ? res.statusCode : 500;
    res.status(status).json({ error: "Notification processing failed" });
  }
);

app.use("/check", (req, res) => {
  res.status(200).json({ message: "OK" });
});

// Error handling middleware
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    logger.error(err, "Unhandled error");
    res.status(500).json({ error: "Internal Server Error" });
  }
);

// Graceful shutdown handling
process.on("SIGTERM", async () => {
  await serviceManager.shutdown();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await serviceManager.shutdown();
  process.exit(0);
});

// Start the server
app.listen(port, () => {
  logger.info(`Queue service listening on port ${port}`);
});
