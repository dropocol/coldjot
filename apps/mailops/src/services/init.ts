import { logger } from "@/lib/log";
import { createServiceManager } from "./service-manager";

let serviceManager: ReturnType<typeof createServiceManager> | null = null;

export async function initializeServices(): Promise<void> {
  try {
    logger.info("🚀 Starting services initialization...");

    // Create service manager
    serviceManager = createServiceManager();

    // Initialize all services
    await serviceManager.initialize();

    // Handle process termination
    process.on("SIGTERM", async () => {
      logger.info("🛑 Received SIGTERM signal");
      await shutdownServices();
      process.exit(0);
    });

    process.on("SIGINT", async () => {
      logger.info("🛑 Received SIGINT signal");
      await shutdownServices();
      process.exit(0);
    });

    logger.info("✨ Services initialization complete");
  } catch (error) {
    logger.error({ err: error }, "❌ Error during services initialization");
    throw error;
  }
}

export async function shutdownServices(): Promise<void> {
  try {
    if (serviceManager) {
      logger.info("🛑 Starting services shutdown...");
      await serviceManager.shutdown();
      serviceManager = null;
      logger.info("✨ Services shutdown complete");
    }
  } catch (error) {
    logger.error({ err: error }, "❌ Error during services shutdown");
    throw error;
  }
}

export function getServiceManager(): ReturnType<typeof createServiceManager> {
  if (!serviceManager) {
    throw new Error("Service manager not initialized");
  }
  return serviceManager;
}
