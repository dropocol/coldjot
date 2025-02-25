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
    logger.info(
      {
        devMode: WATCH_CONFIG.DEV.ENABLED,
        devSettings: WATCH_CONFIG.DEV.ENABLED ? WATCH_CONFIG.DEV : null,
      },
      "Starting watch cleanup service"
    );

    // Run cleanup immediately
    await this.cleanup();

    // Calculate interval based on environment
    const intervalMs = WATCH_CONFIG.DEV.ENABLED
      ? WATCH_CONFIG.DEV.CLEANUP_INTERVAL_MINUTES * 60 * 1000 // Use dev settings
      : WATCH_CONFIG.CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000; // Use production settings

    // Schedule periodic cleanup
    this.cleanupInterval = setInterval(() => this.cleanup(), intervalMs);

    logger.info(
      {
        devMode: WATCH_CONFIG.DEV.ENABLED,
        intervalMinutes: WATCH_CONFIG.DEV.ENABLED
          ? WATCH_CONFIG.DEV.CLEANUP_INTERVAL_MINUTES
          : WATCH_CONFIG.CLEANUP_INTERVAL_HOURS * 60,
      },
      "Watch cleanup service started successfully"
    );
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

  /**
   * Run a cleanup cycle to check for watches that need renewal
   * This method is made public to allow for manual triggering in debug scenarios
   */
  async cleanup(): Promise<void> {
    try {
      logger.info(
        { devMode: WATCH_CONFIG.DEV.ENABLED },
        "Starting cleanup cycle"
      );

      const now = new Date();

      // Use a much shorter renewal buffer in development mode
      const renewalBuffer = WATCH_CONFIG.DEV.ENABLED
        ? new Date(
            now.getTime() + WATCH_CONFIG.DEV.RENEWAL_BUFFER_MINUTES * 60 * 1000
          )
        : new Date(
            now.getTime() + WATCH_CONFIG.RENEWAL_BUFFER_HOURS * 60 * 60 * 1000
          );

      logger.info(
        {
          now: now.toISOString(),
          renewalBuffer: renewalBuffer.toISOString(),
          devMode: WATCH_CONFIG.DEV.ENABLED,
          bufferUsed: WATCH_CONFIG.DEV.ENABLED
            ? `${WATCH_CONFIG.DEV.RENEWAL_BUFFER_MINUTES} minutes`
            : `${WATCH_CONFIG.RENEWAL_BUFFER_HOURS} hours`,
        },
        "Calculated renewal buffer time"
      );

      // Find watches that need renewal
      const watchesToRenew = await prisma.emailWatch.findMany({
        where: {
          expiration: {
            lte: renewalBuffer,
          },
        },
      });

      // Log all watches for debugging in dev mode
      if (WATCH_CONFIG.DEV.ENABLED) {
        const allWatches = await prisma.emailWatch.findMany();
        logger.info(
          {
            allWatchesCount: allWatches.length,
            allWatches: allWatches.map((w) => ({
              id: w.id,
              email: w.email,
              expiration: w.expiration,
              needsRenewal: w.expiration <= renewalBuffer,
            })),
          },
          "All watches in the system"
        );
      }

      logger.info(
        {
          count: watchesToRenew.length,
          watches: watchesToRenew.map((w) => ({
            id: w.id,
            email: w.email,
            expiration: w.expiration,
          })),
        },
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

      const deleteResult = await prisma.emailWatchHistory.deleteMany({
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

// Get an instance of the cleanup service
// const watchCleanupService = new WatchCleanupService();

// Option 1: Set a watch to expire soon and let the automatic process handle it
// await watchCleanupService.setWatchNearExpirationByEmail('your.email@example.com', 3);
// The next cleanup cycle will detect this watch needs renewal

// Option 2: Force immediate renewal
// await watchCleanupService.forceRenewWatchByEmail('your.email@example.com');

// Option 3: Manually trigger a cleanup cycle
// await watchCleanupService.manualCleanup();

// Option 4: Run a comprehensive test of the renewal process
// const testResult = await watchCleanupService.testWatchRenewalProcess('your.email@example.com');
// console.log(JSON.stringify(testResult, null, 2));
