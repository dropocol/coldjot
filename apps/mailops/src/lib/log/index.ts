import pino from "pino";
import { env } from "@/config";
import path from "path";
import fs from "fs";

// Get the number of parent folders to show from environment or default to showing all
const LOG_PATH_DEPTH = env.LOG_PATH_DEPTH
  ? parseInt(env.LOG_PATH_DEPTH.toString())
  : 2; // 0 means show all

// Create logs directory if it doesn't exist
if (env.LOG_TO_FILE && !fs.existsSync(env.LOG_DIR)) {
  fs.mkdirSync(env.LOG_DIR, { recursive: true });
}

// Get the caller file name
const getCallerFile = () => {
  const err = new Error();
  Error.prepareStackTrace = (_, stack) => stack;
  const stack = err.stack as unknown as NodeJS.CallSite[];
  Error.prepareStackTrace = undefined;

  // Find the first caller that isn't this file or pino
  const caller = stack.find((call) => {
    const fileName = call.getFileName();
    return (
      fileName &&
      !fileName.includes("/lib/log/") &&
      !fileName.includes("node_modules/pino")
    );
  });

  if (!caller) return "unknown";

  const fileName = caller.getFileName() || "";

  // Find the position of /src/ in the path
  const srcIndex = fileName.indexOf("/src/");
  if (srcIndex !== -1) {
    // Get everything after /src/
    const relativePath = fileName.slice(srcIndex + 5);

    // If LOG_PATH_DEPTH is 0, return the full path
    if (LOG_PATH_DEPTH === 0) {
      return relativePath;
    }

    // Split the path and take the last N parts based on LOG_PATH_DEPTH
    const parts = relativePath.split("/");
    return parts.slice(Math.max(0, parts.length - LOG_PATH_DEPTH)).join("/");
  }

  return path.basename(fileName);
};

// Create a fixed-width formatter for the file name
const formatFileName = (fileName: string) => {
  const maxWidth = 35; // Increased to accommodate full paths
  const dots = "-".repeat(Math.max(1, maxWidth - fileName.length - 2)); // -2 for the brackets, ensure at least 1 dot
  return `${fileName} ${dots}`;
};

// Setup destinations
const destinations = [
  {
    stream: pino.transport({
      target: "pino-pretty",
      options: {
        colorize: true,
        ignore: env.LOG_SHOW_TIME
          ? "pid,hostname,fileName,paddedFileName"
          : "pid,hostname,fileName,paddedFileName,time",
        translateTime: env.LOG_SHOW_TIME ? "yyyy-mm-dd HH:MM:ss" : false,
        messageFormat: "{paddedFileName} {msg}",
      },
    }),
  },
];

// Add file destination if enabled
if (env.LOG_TO_FILE) {
  const logFile = path.join(
    env.LOG_DIR,
    `${env.APP_ENV}-${new Date().toISOString().split("T")[0]}.log`
  );
  destinations.push({ stream: fs.createWriteStream(logFile, { flags: "a" }) });
}

// Create the logger instance
export const logger = pino(
  {
    level: env.LOG_LEVEL || "debug",
    formatters: {
      level: (label) => ({ level: label.toUpperCase() }),
      bindings: () => ({}),
    },
    mixin() {
      const fileName = getCallerFile();
      return {
        fileName,
        paddedFileName: formatFileName(fileName),
      };
    },
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
  },
  pino.multistream(destinations)
);
