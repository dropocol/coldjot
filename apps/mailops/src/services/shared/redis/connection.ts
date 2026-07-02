import { ConnectionOptions } from "bullmq";
import { logger } from "@/lib/log";
import Redis from "ioredis";

export class RedisConnection {
  private static instance: RedisConnection;
  private client: Redis;

  private constructor() {
    const options: ConnectionOptions = {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: null,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    };

    this.client = new Redis(options);

    this.client.on("error", (error) => {
      logger.error({ err: error }, "Redis connection error");
    });

    this.client.on("connect", () => {
      logger.info("Redis connected successfully");
    });
  }

  public static getInstance(): RedisConnection {
    if (!RedisConnection.instance) {
      RedisConnection.instance = new RedisConnection();
    }
    return RedisConnection.instance;
  }

  public getClient(): Redis {
    return this.client;
  }

  // Redis methods
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string | number): Promise<"OK"> {
    return this.client.set(key, value);
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.client.expire(key, seconds);
  }

  async hset(
    key: string,
    field: string,
    value: string | number
  ): Promise<number> {
    return this.client.hset(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field);
  }

  async hdel(key: string, field: string): Promise<number> {
    return this.client.hdel(key, field);
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}

export const redisConnection = RedisConnection.getInstance();
