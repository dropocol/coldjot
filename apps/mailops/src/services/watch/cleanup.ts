import { prisma } from "@coldjot/database";
import { WATCH_CONFIG } from "../../config/watch/constants";
import { WatchService } from "./index";
import { logger } from "@/lib/log";

export class WatchCleanupService {
  private watchService: WatchService;
  private cleanupInterval: NodeJS.Timeout | null;

  constructor() {
    this.watchService = new WatchService();
    this.cleanupInterval = null;
  }

  async start(): Promise<void> {
    logger.info("Starting watch cleanup service");

    // Run cleanup immediately
    await this.cleanup();

    // Schedule periodic cleanup
    this.cleanupInterval = setInterval(
      () => this.cleanup(),
      WATCH_CONFIG.CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000
    );

    logger.info("Watch cleanup service started successfully");
  }

  async stop(): Promise<void> {
    logger.info("Stopping watch cleanup service");

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Run one final cleanup before stopping
    try {
      await this.cleanup();
    } catch (error) {
      logger.error({ error }, "Error during final cleanup");
    }

    logger.info("Watch cleanup service stopped successfully");
  }

  private async cleanup(): Promise<void> {
    try {
      const now = new Date();
      const renewalBuffer = new Date(
        now.getTime() + WATCH_CONFIG.RENEWAL_BUFFER_HOURS * 60 * 60 * 1000
      );

      // Find watches that need renewal
      const watchesToRenew = await prisma.emailWatch.findMany({
        where: {
          expiration: {
            lte: renewalBuffer,
          },
        },
      });

      logger.info(
        { count: watchesToRenew.length },
        "Found watches that need renewal"
      );

      // Process each watch
      for (const watch of watchesToRenew) {
        try {
          await this.watchService.renewWatch(watch.id);
          logger.info({ watchId: watch.id }, "Successfully renewed watch");
        } catch (error) {
          logger.error({ error, watchId: watch.id }, "Failed to renew watch");

          // If renewal fails, try to stop the watch
          try {
            await this.watchService.stopWatch(watch.email);
          } catch (stopError) {
            logger.error(
              { error: stopError, watchId: watch.id },
              "Failed to stop watch after renewal failure"
            );
          }
        }
      }

      // Clean up old notification history
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const deleteResult = await prisma.notificationHistory.deleteMany({
        where: {
          createdAt: {
            lt: thirtyDaysAgo,
          },
          processed: true,
        },
      });

      logger.info(
        { deletedCount: deleteResult.count },
        "Cleaned up old notification history"
      );

      logger.info("Completed watch cleanup cycle");
    } catch (error) {
      logger.error({ error }, "Failed to run watch cleanup");
      // Don't throw the error to prevent the cleanup service from stopping
    }
  }
}
