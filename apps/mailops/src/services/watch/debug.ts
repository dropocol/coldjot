import { prisma } from "@coldjot/database";
import { WATCH_CONFIG } from "../../config/watch/constants";
import { WatchService } from "./index";
import { WatchCleanupService } from "./cleanup";
import { logger } from "@/lib/log";

/**
 * Debug utilities for testing and troubleshooting Gmail watch functionality
 * This class contains methods for manually testing watch renewal and other operations
 */
export class WatchDebugService {
  private watchService: WatchService;
  private cleanupService: WatchCleanupService;

  constructor() {
    this.watchService = new WatchService();
    this.cleanupService = new WatchCleanupService();
  }

  /**
   * Force renewal of a specific watch by ID
   * This is useful for development and testing
   * @param watchId The ID of the watch to renew
   */
  async forceRenewWatch(watchId: string): Promise<void> {
    logger.info({ watchId }, "Forcing renewal of watch");

    try {
      // Get the watch to ensure it exists
      const watch = await prisma.emailWatch.findUnique({
        where: { id: watchId },
      });

      if (!watch) {
        logger.error({ watchId }, "Watch not found for forced renewal");
        throw new Error(`Watch with ID ${watchId} not found`);
      }

      // Force renewal regardless of expiration time
      await this.watchService.renewWatch(watchId);
      logger.info({ watchId }, "Successfully forced renewal of watch");
    } catch (error) {
      logger.error({ error, watchId }, "Failed to force renew watch");
      throw error;
    }
  }

  /**
   * Force renewal of a watch by email address
   * This is useful for development and testing
   * @param email The email address associated with the watch
   */
  async forceRenewWatchByEmail(email: string): Promise<void> {
    logger.info({ email }, "Forcing renewal of watch by email");

    try {
      // Get the watch to ensure it exists
      const watch = await prisma.emailWatch.findFirst({
        where: { email },
      });

      if (!watch) {
        logger.error({ email }, "Watch not found for forced renewal");
        throw new Error(`Watch for email ${email} not found`);
      }

      // Force renewal regardless of expiration time
      await this.watchService.renewWatch(watch.id);
      logger.info(
        { watchId: watch.id, email },
        "Successfully forced renewal of watch"
      );
    } catch (error) {
      logger.error({ error, email }, "Failed to force renew watch by email");
      throw error;
    }
  }

  /**
   * Set a watch's expiration time to be very close to expiring
   * This is useful for testing the renewal process
   * @param watchId The ID of the watch to update
   * @param minutesUntilExpiration How many minutes until the watch expires (default: from DEV settings)
   */
  async setWatchNearExpiration(
    watchId: string,
    minutesUntilExpiration?: number
  ): Promise<void> {
    // Use the configured development expiration time if not specified
    const expirationMinutes =
      minutesUntilExpiration ?? WATCH_CONFIG.DEV.DEFAULT_EXPIRATION_MINUTES;

    logger.info(
      { watchId, minutesUntilExpiration: expirationMinutes },
      "Setting watch near expiration for testing"
    );

    try {
      // Get the watch to ensure it exists
      const watch = await prisma.emailWatch.findUnique({
        where: { id: watchId },
      });

      if (!watch) {
        logger.error({ watchId }, "Watch not found for expiration update");
        throw new Error(`Watch with ID ${watchId} not found`);
      }

      // Calculate new expiration time
      const now = new Date();
      const newExpiration = new Date(
        now.getTime() + expirationMinutes * 60 * 1000
      );

      // Update the watch expiration time
      await prisma.emailWatch.update({
        where: { id: watchId },
        data: { expiration: newExpiration },
      });

      logger.info(
        {
          watchId,
          oldExpiration: watch.expiration,
          newExpiration,
          minutesUntilExpiration: expirationMinutes,
        },
        "Successfully updated watch expiration time for testing"
      );
    } catch (error) {
      logger.error(
        { error, watchId, minutesUntilExpiration: expirationMinutes },
        "Failed to update watch expiration time"
      );
      throw error;
    }
  }

  /**
   * Set a watch's expiration time to be very close to expiring by email
   * This is useful for testing the renewal process
   * @param email The email address associated with the watch
   * @param minutesUntilExpiration How many minutes until the watch expires (default: from DEV settings)
   */
  async setWatchNearExpirationByEmail(
    email: string,
    minutesUntilExpiration?: number
  ): Promise<void> {
    // Use the configured development expiration time if not specified
    const expirationMinutes =
      minutesUntilExpiration ?? WATCH_CONFIG.DEV.DEFAULT_EXPIRATION_MINUTES;

    logger.info(
      { email, minutesUntilExpiration: expirationMinutes },
      "Setting watch near expiration by email for testing"
    );

    try {
      // Get the watch to ensure it exists
      const watch = await prisma.emailWatch.findFirst({
        where: { email },
      });

      if (!watch) {
        logger.error({ email }, "Watch not found for expiration update");
        throw new Error(`Watch for email ${email} not found`);
      }

      // Use the existing method to update the expiration
      await this.setWatchNearExpiration(watch.id, expirationMinutes);

      logger.info(
        { email, watchId: watch.id, minutesUntilExpiration: expirationMinutes },
        "Successfully updated watch expiration time by email for testing"
      );
    } catch (error) {
      logger.error(
        { error, email, minutesUntilExpiration: expirationMinutes },
        "Failed to update watch expiration time by email"
      );
      throw error;
    }
  }

  /**
   * Manually trigger a cleanup cycle for testing purposes
   * This is useful for development and debugging
   */
  async manualCleanup(): Promise<void> {
    logger.info("Manually triggering cleanup cycle");
    await this.cleanupService.cleanup();
    logger.info("Manual cleanup cycle completed");
  }

  /**
   * Comprehensive test helper for verifying the watch renewal process
   * This method:
   * 1. Sets a watch to expire soon
   * 2. Runs a cleanup cycle
   * 3. Verifies the watch was renewed
   *
   * @param email The email address of the watch to test
   * @param minutesUntilExpiration How many minutes until expiration (default: from DEV settings)
   * @returns A detailed report of the test results
   */
  async testWatchRenewalProcess(
    email: string,
    minutesUntilExpiration?: number
  ): Promise<{
    success: boolean;
    originalWatch?: any;
    updatedWatch?: any;
    renewalDetected: boolean;
    error?: any;
    message: string;
  }> {
    try {
      logger.info(
        { email, minutesUntilExpiration },
        "Starting comprehensive watch renewal test"
      );

      // 1. Get the original watch
      const originalWatch = await prisma.emailWatch.findFirst({
        where: { email },
      });

      if (!originalWatch) {
        return {
          success: false,
          renewalDetected: false,
          message: `No watch found for email: ${email}`,
        };
      }

      logger.info(
        {
          email,
          watchId: originalWatch.id,
          originalExpiration: originalWatch.expiration,
        },
        "Found original watch for testing"
      );

      // 2. Set the watch to expire soon
      await this.setWatchNearExpirationByEmail(email, minutesUntilExpiration);

      // 3. Get the watch after setting expiration
      const watchAfterExpiration = await prisma.emailWatch.findFirst({
        where: { email },
      });

      // 4. Run a cleanup cycle
      logger.info({ email }, "Running cleanup cycle to test renewal");
      await this.cleanupService.cleanup();

      // 5. Get the watch after cleanup
      const updatedWatch = await prisma.emailWatch.findFirst({
        where: { email },
      });

      if (!updatedWatch) {
        return {
          success: false,
          originalWatch,
          renewalDetected: false,
          message: "Watch was deleted during cleanup",
        };
      }

      // 6. Check if the watch was renewed
      const wasRenewed =
        updatedWatch.expiration > watchAfterExpiration!.expiration &&
        updatedWatch.updatedAt > watchAfterExpiration!.updatedAt;

      const result = {
        success: wasRenewed,
        originalWatch,
        updatedWatch,
        renewalDetected: wasRenewed,
        message: wasRenewed
          ? "Watch was successfully renewed during cleanup"
          : "Watch was NOT renewed during cleanup",
      };

      logger.info(
        {
          email,
          watchId: originalWatch.id,
          wasRenewed,
          originalExpiration: originalWatch.expiration,
          expirationAfterSet: watchAfterExpiration?.expiration,
          finalExpiration: updatedWatch.expiration,
        },
        result.message
      );

      return result;
    } catch (error) {
      logger.error({ error, email }, "Error during watch renewal test");

      return {
        success: false,
        renewalDetected: false,
        error,
        message: `Error during test: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

// Example usage:
/*
// Create a debug service instance
const watchDebugService = new WatchDebugService();

// Option 1: Set a watch to expire soon and let the automatic process handle it
await watchDebugService.setWatchNearExpirationByEmail('your.email@example.com', 3);
// The next cleanup cycle will detect this watch needs renewal

// Option 2: Force immediate renewal
await watchDebugService.forceRenewWatchByEmail('your.email@example.com');

// Option 3: Manually trigger a cleanup cycle
await watchDebugService.manualCleanup();

// Option 4: Run a comprehensive test of the renewal process
const testResult = await watchDebugService.testWatchRenewalProcess('your.email@example.com');
console.log(JSON.stringify(testResult, null, 2));
*/
