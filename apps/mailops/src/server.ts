import express from "express";
import cors from "cors";
import { logger } from "@/lib/log";
import pinoHttp from "pino-http";
import { createApp, initializeApp, shutdownApp } from "@/composition-root";
import { makeRouter } from "./routes";
import { makeMailboxRouter } from "./routes/mailbox";
import { makeListsRouter } from "./routes/lists";
import { makePubsubRouter } from "./routes/pubsub";
import { requireServiceToken } from "@/lib/auth/service-auth";
import { env } from "@/config";
import { mountBullBoard } from "@/lib/bull-board";

const app = express();
const port = 3001;

// The app graph is constructed once. infra singletons + queues + processors +
// controllers all live here; server.ts only wires them into Express.
const mailopsApp = createApp();

// ---- Middleware (registered before init so requests during boot get a
//      proper error response rather than hanging) ---------------------------

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

// ---- Initialize infra (Redis, PubSub, memory monitor, watch cleanup),
//      then mount the routes that depend on it. -------------------------------

initializeApp(mailopsApp)
  .then(() => {
    // Bull-Board — gate behind the service token (plan 03).
    const bullBoardQueues = [
      ...mailopsApp.queues.values(),
      ...mailopsApp.dlQueues.values(),
    ];
    app.use("/admin/queues", requireServiceToken, mountBullBoard(bullBoardQueues));
    logger.info("📊 Bull-Board mounted at /admin/queues");

    // Public/webhook routes — MUST be mounted before the /api token gate below.
    // Express matches prefixes in registration order, so if /api were mounted
    // first it would swallow /api/pubsub and run requireServiceToken on it
    // (rejecting Google's JWT-bearing push with 401). Mount specific public
    // paths first so they win. PubSub verifies Google's signed JWT itself.
    const pubsubRouter = makePubsubRouter(mailopsApp.inboxSync);
    app.use("/pubsub", pubsubRouter); // Keep the /pubsub route for Gmail notifications
    app.use("/api/pubsub", pubsubRouter); // Also mounted under /api for consistency

    // Internal routes — require the shared service token. The web app must
    // send X-Service-Token on every call.
    app.use("/api", requireServiceToken, makeRouter(mailopsApp));
    app.use("/api/mailbox", requireServiceToken, makeMailboxRouter(mailopsApp.mailboxController));
    app.use("/api/lists", requireServiceToken, makeListsRouter(mailopsApp.listController));
  })
  .catch((error) => {
    logger.error({ err: error }, "Failed to initialize app");
    process.exit(1);
  });

app.use("/check", (req, res) => {
  res.status(200).json({ message: "OK" });
});

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
  await shutdownApp(mailopsApp);
  process.exit(0);
});

process.on("SIGINT", async () => {
  await shutdownApp(mailopsApp);
  process.exit(0);
});

// Start the server
app.listen(port, () => {
  logger.info(`Queue service listening on port ${port}`);
});
