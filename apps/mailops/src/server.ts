import express from "express";
import cors from "cors";
import { logger } from "@/lib/log";
import pinoHttp from "pino-http";
import routes from "./routes";
import { createServiceManager } from "@/services/service-manager";
import pubsubRouter from "./routes/pubsub";
import mailboxRouter from "./routes/mailbox";
import listsRouter from "./routes/lists";

const app = express();
const port = 3001;
const serviceManager = createServiceManager();

// Initialize all services
serviceManager.initialize().catch((error) => {
  logger.error("Failed to initialize services:", error);
  process.exit(1);
});

// Middleware
app.use(cors());
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

// Mount all routes
app.use("/api", routes);
app.use("/pubsub", pubsubRouter); // Keep the /pubsub route for Gmail notifications
app.use("/api/pubsub", pubsubRouter); // Also mount under /api for consistency
app.use("/api/mailbox", mailboxRouter);
app.use("/api/lists", listsRouter);

// Add specific error handling for PubSub routes
app.use(
  "/pubsub",
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    logger.error(
      {
        error: err,
        body: req.body,
        headers: req.headers,
      },
      "PubSub notification error"
    );
    res.status(200).json({ message: "Notification received" }); // Always return 200 to acknowledge
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
