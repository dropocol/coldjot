import { logger } from "../log/logger";

export class MemoryMonitor {
  private static instance: MemoryMonitor;
  private checkInterval: NodeJS.Timeout | null = null;

  // Memory thresholds in MB
  private readonly TARGET_MEMORY_LIMIT = 512; // 512MB target limit
  private readonly warningThresholdMB = this.TARGET_MEMORY_LIMIT * 0.8; // 409.6MB (80% of 512MB)
  private readonly criticalThresholdMB = this.TARGET_MEMORY_LIMIT * 0.9; // 460.8MB (90% of 512MB)

  private constructor() {}

  public static getInstance(): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor();
    }
    return MemoryMonitor.instance;
  }

  public startMonitoring(intervalMs: number = 60000): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, intervalMs);

    // Initial check
    this.checkMemoryUsage();
  }

  public stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  private checkMemoryUsage(): void {
    const used = process.memoryUsage();
    const heapUsed = used.heapUsed / 1024 / 1024; // Convert to MB
    const heapTotal = used.heapTotal / 1024 / 1024;
    const rss = used.rss / 1024 / 1024;
    const external = used.external / 1024 / 1024;

    // Log memory usage
    // logger.info(
    //   {
    //     heapUsed: `${Math.round(heapUsed)}MB`,
    //     heapTotal: `${Math.round(heapTotal)}MB`,
    //     rss: `${Math.round(rss)}MB`,
    //     external: `${Math.round(external)}MB`,
    //     warningThreshold: `${Math.round(this.warningThresholdMB)}MB`,
    //     criticalThreshold: `${Math.round(this.criticalThresholdMB)}MB`,
    //     targetLimit: `${this.TARGET_MEMORY_LIMIT}MB`,
    //   },
    //   "📊 Memory Usage"
    // );

    // Check against absolute thresholds
    if (heapUsed > this.criticalThresholdMB) {
      logger.error(
        {
          heapUsed: `${Math.round(heapUsed)}MB`,
          criticalThreshold: `${Math.round(this.criticalThresholdMB)}MB`,
          percentageUsed: `${Math.round((heapUsed / this.TARGET_MEMORY_LIMIT) * 100)}%`,
        },
        "🚨 Critical memory usage detected! Initiating garbage collection..."
      );
      if (global.gc) {
        global.gc();
        // Log memory usage after garbage collection
        const afterGC = process.memoryUsage();
        logger.info(
          {
            heapUsedBefore: `${Math.round(heapUsed)}MB`,
            heapUsedAfter: `${Math.round(afterGC.heapUsed / 1024 / 1024)}MB`,
            memoryFreed: `${Math.round((used.heapUsed - afterGC.heapUsed) / 1024 / 1024)}MB`,
          },
          "♻️ Garbage collection completed"
        );
      }
    } else if (heapUsed > this.warningThresholdMB) {
      logger.warn(
        {
          heapUsed: `${Math.round(heapUsed)}MB`,
          warningThreshold: `${Math.round(this.warningThresholdMB)}MB`,
          percentageUsed: `${Math.round((heapUsed / this.TARGET_MEMORY_LIMIT) * 100)}%`,
        },
        "⚠️ High memory usage detected"
      );
    }
  }
}

// Export singleton instance
export const memoryMonitor = MemoryMonitor.getInstance();