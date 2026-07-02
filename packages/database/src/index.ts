import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  var prisma: PrismaClient | undefined;
}

/**
 * Prisma 7 moved to a driver-adapter model: the connection URL no longer
 * lives in schema.prisma. Instead we pass an adapter (PrismaPg) constructed
 * from the DATABASE_URL to the PrismaClient constructor.
 */
function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : process.env.LOG_LEVEL === "debug"
          ? ["query", "error", "warn"]
          : ["error"],
  });
}

export const prisma = globalThis.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;

// Re-export all Prisma types
export * from "@prisma/client";
