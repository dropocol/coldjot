import { logger } from "@/lib/log";
import { REDIS_KEYS, type RateLimitType, RateLimitEnum } from "@/config";
import { RedisConnection } from "@/services/shared/redis/connection";

interface RateLimitInfo {
  allowed: boolean;
  current?: number;
  limit?: number;
  cooldown?: {
    type?: string;
    remaining?: number;
  };
  debug?: {
    keys?: string[];
    values?: any[];
    reason?: string;
  };
}

interface RateLimitData {
  count: number;
  lastUpdated: number;
  limit: number;
}

export class RateLimitService {
  private static instance: RateLimitService;
  private redis = RedisConnection.getInstance().getClient();

  // Default limits - could be moved to config
  private readonly DEFAULT_RATE_LIMIT = 500;
  private readonly DEFAULT_TTL = 24 * 60 * 60; // 24 hours in seconds

  private constructor() {}

  public static getInstance(): RateLimitService {
    if (!RateLimitService.instance) {
      RateLimitService.instance = new RateLimitService();
    }
    return RateLimitService.instance;
  }

  private getKey(
    type: RateLimitType,
    entityId: string,
    userId?: string
  ): string {
    switch (type) {
      case RateLimitEnum.USER:
        if (!userId) throw new Error("User ID required for user rate limit");
        return REDIS_KEYS.rateLimits.user(userId);
      case RateLimitEnum.SEQUENCE:
        if (!userId)
          throw new Error("User ID required for sequence rate limit");
        return REDIS_KEYS.rateLimits.sequence(userId, entityId);
      case RateLimitEnum.CONTACT:
        return REDIS_KEYS.rateLimits.contact(userId || "", "", entityId);
      case RateLimitEnum.COOLDOWN:
        return REDIS_KEYS.rateLimits.cooldown(userId || "", "", entityId);
      default:
        throw new Error(`Invalid rate limit type: ${type}`);
    }
  }

  async checkRateLimit(
    userId: string,
    sequenceId?: string,
    contactId?: string
  ): Promise<RateLimitInfo> {
    try {
      const pipeline = this.redis.pipeline();
      const keys: string[] = [];
      const debugInfo: any[] = [];

      // Get all relevant rate limits using hgetall
      const userKey = this.getKey(RateLimitEnum.USER, userId, userId);
      keys.push(userKey);
      pipeline.hgetall(userKey);

      if (sequenceId) {
        const sequenceKey = this.getKey(
          RateLimitEnum.SEQUENCE,
          sequenceId,
          userId
        );
        keys.push(sequenceKey);
        pipeline.hgetall(sequenceKey);
      }

      if (contactId) {
        const contactKey = this.getKey(RateLimitEnum.CONTACT, contactId);
        const cooldownKey = this.getKey(RateLimitEnum.COOLDOWN, contactId);
        keys.push(contactKey, cooldownKey);
        pipeline.hgetall(contactKey);
        pipeline.hgetall(cooldownKey);
      }

      // Log keys being checked
      // logger.info(
      //   {
      //     keys,
      //     userId,
      //     sequenceId,
      //     contactId,
      //   },
      //   "Checking rate limits for keys:"
      // );

      const results = await pipeline.exec();
      if (!results) {
        logger.error("Failed to execute rate limit pipeline");
        return {
          allowed: true,
          debug: {
            keys,
            reason: "Pipeline execution failed",
          },
        }; // Fail open
      }

      // Store debug info
      results.forEach((result, index) => {
        const value = result?.[1] || null;
        debugInfo.push({
          key: keys[index],
          value,
          error: result?.[0] || null,
        });
        // logger.info(
        //   {
        //     key: keys[index],
        //     value,
        //   },
        //   `Rate limit value for ${keys[index]}:`
        // );
      });

      // Check cooldown first
      const cooldownData = contactId && (results[3]?.[1] as RateLimitData);
      if (cooldownData && Object.keys(cooldownData).length > 0) {
        const remaining = parseInt(String(cooldownData.count));
        if (remaining > 0) {
          logger.warn(
            {
              remaining,
              cooldownData,
              key: keys[3],
            },
            "Cooldown active:"
          );
          return {
            allowed: false,
            cooldown: {
              type: "cooldown",
              remaining,
            },
            debug: {
              keys,
              values: debugInfo,
              reason: `Cooldown active: ${remaining}ms remaining`,
            },
          };
        }
      }

      // Process rate limits - handle empty hash results
      const limits = results
        .slice(0, -1)
        .filter((r) => r?.[1] && Object.keys(r[1]).length > 0) // Only process non-empty hash results
        .map((r) => {
          const data = r[1] as RateLimitData;
          return data?.count ? parseInt(String(data.count)) : 0;
        });

      // If no limits found, this is a first-time access
      if (limits.length === 0) {
        logger.info("No existing rate limits found - first time access");
        return {
          allowed: true,
          current: 0,
          limit: this.DEFAULT_RATE_LIMIT,
          debug: {
            keys,
            values: debugInfo,
            reason: "First time access - no existing limits",
          },
        };
      }

      const maxCount = Math.max(...limits, 0);
      const isAllowed = maxCount < this.DEFAULT_RATE_LIMIT;

      // Log detailed information for debugging
      // logger.info(
      //   {
      //     userId,
      //     sequenceId,
      //     contactId,
      //     maxCount,
      //     isAllowed,
      //     keys,
      //     debugInfo,
      //     limits,
      //   },
      //   "Rate limit check result:"
      // );

      return {
        allowed: isAllowed,
        current: maxCount,
        limit: this.DEFAULT_RATE_LIMIT,
        debug: {
          keys,
          values: debugInfo,
          reason: isAllowed
            ? "Within limits"
            : `Rate limit exceeded: ${maxCount}/${this.DEFAULT_RATE_LIMIT}`,
        },
      };
    } catch (error) {
      logger.error(
        {
          error,
          userId,
          sequenceId,
          contactId,
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Rate limit check failed:"
      );
      return {
        allowed: true,
        debug: {
          keys: [],
          reason: `Error during check: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      }; // Fail open
    }
  }

  async incrementCounters(
    userId: string,
    sequenceId?: string,
    contactId?: string
  ): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      const now = Date.now();
      const keys: string[] = [];

      // Helper function to set hash fields
      const setRateLimit = (key: string) => {
        keys.push(key);
        pipeline.hincrby(key, "count", 1);
        pipeline.hset(key, "lastUpdated", now);
        pipeline.hset(key, "limit", this.DEFAULT_RATE_LIMIT);
        pipeline.expire(key, this.DEFAULT_TTL);
      };

      // Increment all relevant counters
      setRateLimit(this.getKey(RateLimitEnum.USER, userId, userId));
      if (sequenceId) {
        setRateLimit(this.getKey(RateLimitEnum.SEQUENCE, sequenceId, userId));
      }
      if (contactId) {
        setRateLimit(this.getKey(RateLimitEnum.CONTACT, contactId));
      }

      // Log what we're about to do
      logger.info(
        {
          keys,
          userId,
          sequenceId,
          contactId,
        },
        "Incrementing rate limits:"
      );

      const results = await pipeline.exec();

      // Log increment operation results
      // logger.info(
      //   {
      //     userId,
      //     sequenceId,
      //     contactId,
      //     keys,
      //     results: results?.map((r, i) => ({
      //       key: keys[Math.floor(i / 4)],
      //       value: r?.[1],
      //       error: r?.[0],
      //     })),
      //   },
      //   "Rate limit increment results:"
      // );
    } catch (error) {
      logger.error(
        {
          error,
          userId,
          sequenceId,
          contactId,
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Failed to increment rate limit counters:"
      );
      throw error; // Rethrow to handle at caller
    }
  }

  async addCooldown(
    entityId: string,
    duration: number,
    userId?: string
  ): Promise<void> {
    try {
      const key = this.getKey(RateLimitEnum.COOLDOWN, entityId);
      const now = Date.now();

      await this.redis
        .pipeline()
        .hset(key, {
          count: duration,
          lastUpdated: now,
          type: "cooldown",
        })
        .pexpire(key, duration)
        .exec();
    } catch (error) {
      logger.error(
        {
          error,
          entityId,
          duration,
          userId,
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Failed to add cooldown:"
      );
    }
  }

  async resetLimits(
    userId: string,
    sequenceId?: string,
    contactId?: string
  ): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      const keys: string[] = [];

      // Delete all relevant keys
      const userKey = this.getKey(RateLimitEnum.USER, userId, userId);
      keys.push(userKey);
      pipeline.del(userKey);

      if (sequenceId) {
        const sequenceKey = this.getKey(
          RateLimitEnum.SEQUENCE,
          sequenceId,
          userId
        );
        keys.push(sequenceKey);
        pipeline.del(sequenceKey);
      }

      if (contactId) {
        const contactKey = this.getKey(RateLimitEnum.CONTACT, contactId);
        const cooldownKey = this.getKey(RateLimitEnum.COOLDOWN, contactId);
        keys.push(contactKey, cooldownKey);
        pipeline.del(contactKey);
        pipeline.del(cooldownKey);
      }

      // Log what we're about to delete
      logger.info(
        {
          keys,
          userId,
          sequenceId,
          contactId,
        },
        "Resetting rate limits for keys:"
      );

      const results = await pipeline.exec();

      // Log results
      logger.info(
        {
          keys,
          results: results?.map((r, i) => ({
            key: keys[i],
            deleted: r?.[1],
            error: r?.[0],
          })),
        },
        "Rate limit reset results:"
      );

      logger.info(`✓ Rate limits reset for user: ${userId}`);
    } catch (error) {
      logger.error(
        {
          error,
          userId,
          sequenceId,
          contactId,
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Failed to reset rate limits:"
      );
      throw error;
    }
  }

  async getLimits(
    userId: string,
    sequenceId?: string,
    contactId?: string
  ): Promise<{
    current: number;
    limit: number;
    cooldowns: { [key: string]: number };
    lastUpdated?: number;
  }> {
    try {
      const pipeline = this.redis.pipeline();

      // Get all relevant rate limits
      pipeline.hgetall(this.getKey(RateLimitEnum.USER, userId, userId));
      if (sequenceId) {
        pipeline.hgetall(
          this.getKey(RateLimitEnum.SEQUENCE, sequenceId, userId)
        );
      }
      if (contactId) {
        pipeline.hgetall(this.getKey(RateLimitEnum.CONTACT, contactId));
        pipeline.hgetall(this.getKey(RateLimitEnum.COOLDOWN, contactId));
      }

      const results = await pipeline.exec();
      if (!results) {
        throw new Error("Failed to get rate limits");
      }

      const limits = results
        .filter((r) => r?.[1])
        .map((r) => {
          const data = r[1] as RateLimitData;
          return data ? parseInt(String(data.count)) : 0;
        });

      const lastUpdated = results
        .filter((r) => r?.[1])
        .map((r) => {
          const data = r[1] as RateLimitData;
          return data ? parseInt(String(data.lastUpdated)) : 0;
        })
        .sort()
        .pop();

      return {
        current: Math.max(...limits, 0),
        limit: this.DEFAULT_RATE_LIMIT,
        lastUpdated,
        cooldowns:
          contactId && results[3]?.[1]
            ? {
                [contactId]: parseInt(
                  String((results[3][1] as RateLimitData).count)
                ),
              }
            : {},
      };
    } catch (error) {
      logger.error(error, "Failed to get rate limits:");
      return {
        current: 0,
        limit: this.DEFAULT_RATE_LIMIT,
        cooldowns: {},
      };
    }
  }
}

// Export singleton instance
export const rateLimitService = RateLimitService.getInstance();
