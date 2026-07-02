import { logger } from "@/lib/log";
import { REDIS_KEYS } from "@/config";
import { RedisConnection } from "@/services/shared/redis/connection";
import { MEMORY_MONITOR_CONFIG } from "@/config";

interface MemoryMetrics {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  timestamp: number;
}

export class MemoryMonitor {
  private static instance: MemoryMonitor;
  private redis = RedisConnection.getInstance().getClient();
  private checkInterval: NodeJS.Timeout | null = null;

  private readonly TARGET_MEMORY_LIMIT =
    MEMORY_MONITOR_CONFIG.TARGET_MEMORY_LIMIT;
  private readonly warningThresholdMB =
    this.TARGET_MEMORY_LIMIT *
    MEMORY_MONITOR_CONFIG.WARNING_THRESHOLD_PERCENTAGE;
  private readonly criticalThresholdMB =
    this.TARGET_MEMORY_LIMIT *
    MEMORY_MONITOR_CONFIG.CRITICAL_THRESHOLD_PERCENTAGE;

  private constructor() {}

  public static getInstance(): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor();
    }
    return MemoryMonitor.instance;
  }

  // TODO :  create it as a repeated job
  public async startMonitoring(
    intervalMs: number = MEMORY_MONITOR_CONFIG.CHECK_INTERVAL
  ): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(async () => {
      await this.checkAndStoreMemoryUsage();
    }, intervalMs);

    // Initial check
    await this.checkAndStoreMemoryUsage();
    logger.info("📊 Memory monitoring started");
  }

  public async stopMonitoring(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info("📊 Memory monitoring stopped");
    }
  }

  private async checkAndStoreMemoryUsage(): Promise<void> {
    const used = process.memoryUsage();
    const metrics: MemoryMetrics = {
      heapUsed: Math.round(used.heapUsed / 1024 / 1024), // Convert to MB
      heapTotal: Math.round(used.heapTotal / 1024 / 1024),
      rss: Math.round(used.rss / 1024 / 1024),
      external: Math.round(used.external / 1024 / 1024),
      timestamp: Date.now(),
    };

    try {
      // Store metrics in Redis
      await this.storeMetrics(metrics);

      // Check thresholds and handle alerts
      await this.handleMemoryAlerts(metrics.heapUsed);
    } catch (error) {
      logger.error({ err: error }, "Failed to process memory metrics");
    }
  }

  private async storeMetrics(metrics: MemoryMetrics): Promise<void> {
    try {
      await this.redis.hset(REDIS_KEYS.memory.metrics(), {
        heapUsed: metrics.heapUsed,
        heapTotal: metrics.heapTotal,
        rss: metrics.rss,
        external: metrics.external,
        timestamp: metrics.timestamp,
      });
    } catch (error) {
      logger.error({ err: error }, "Failed to store memory metrics");
    }
  }

  private async handleMemoryAlerts(heapUsedMB: number): Promise<void> {
    // Check against absolute thresholds
    if (heapUsedMB > this.criticalThresholdMB) {
      logger.error(
        {
          heapUsed: `${heapUsedMB}MB`,
          criticalThreshold: `${Math.round(this.criticalThresholdMB)}MB`,
          percentageUsed: `${Math.round((heapUsedMB / this.TARGET_MEMORY_LIMIT) * 100)}%`,
        },
        "🚨 Critical memory usage detected! Initiating garbage collection..."
      );

      // Store alert in Redis
      await this.storeAlert("critical", heapUsedMB);

      // Attempt garbage collection if available
      if (global.gc) {
        global.gc();
        // Log memory usage after garbage collection
        const afterGC = process.memoryUsage();
        const heapUsedAfterMB = Math.round(afterGC.heapUsed / 1024 / 1024);
        const memoryFreedMB = heapUsedMB - heapUsedAfterMB;

        logger.info(
          {
            heapUsedBefore: `${heapUsedMB}MB`,
            heapUsedAfter: `${heapUsedAfterMB}MB`,
            memoryFreed: `${memoryFreedMB}MB`,
          },
          "♻️ Garbage collection completed"
        );
      }
    } else if (heapUsedMB > this.warningThresholdMB) {
      logger.warn(
        {
          heapUsed: `${heapUsedMB}MB`,
          warningThreshold: `${Math.round(this.warningThresholdMB)}MB`,
          percentageUsed: `${Math.round((heapUsedMB / this.TARGET_MEMORY_LIMIT) * 100)}%`,
        },
        "⚠️ High memory usage detected"
      );

      // Store alert in Redis
      await this.storeAlert("warning", heapUsedMB);
    }
  }

  private async storeAlert(
    level: "warning" | "critical",
    heapUsedMB: number
  ): Promise<void> {
    try {
      const alert = {
        level,
        heapUsed: heapUsedMB,
        timestamp: Date.now(),
      };

      await this.redis.hset(REDIS_KEYS.memory.alerts(), {
        level,
        heapUsed: heapUsedMB,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error({ err: error }, "Failed to store memory alert");
    }
  }

  public async getMetrics(): Promise<MemoryMetrics | null> {
    try {
      const metrics = await this.redis.hgetall(REDIS_KEYS.memory.metrics());
      if (!metrics || Object.keys(metrics).length === 0) {
        return null;
      }

      return {
        heapUsed: parseInt(metrics.heapUsed),
        heapTotal: parseInt(metrics.heapTotal),
        rss: parseInt(metrics.rss),
        external: parseInt(metrics.external),
        timestamp: parseInt(metrics.timestamp),
      };
    } catch (error) {
      logger.error({ err: error }, "Failed to get memory metrics");
      return null;
    }
  }

  public async getLatestAlert(): Promise<{
    level: "warning" | "critical";
    heapUsed: number;
    timestamp: number;
  } | null> {
    try {
      const alert = await this.redis.hgetall(REDIS_KEYS.memory.alerts());
      if (!alert || Object.keys(alert).length === 0) {
        return null;
      }

      return {
        level: alert.level as "warning" | "critical",
        heapUsed: parseInt(alert.heapUsed),
        timestamp: parseInt(alert.timestamp),
      };
    } catch (error) {
      logger.error({ err: error }, "Failed to get latest memory alert");
      return null;
    }
  }
}

// Export singleton instance
export const memoryMonitor = MemoryMonitor.getInstance();
