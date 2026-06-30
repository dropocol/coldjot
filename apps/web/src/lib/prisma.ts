// Re-export the singleton Prisma client from the shared database package so
// every consumer uses the same connection pool. Previously this file created a
// second PrismaClient instance, fragmenting connection management.
export { prisma } from "@coldjot/database";
