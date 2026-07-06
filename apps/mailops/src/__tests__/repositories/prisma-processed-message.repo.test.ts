/**
 * Repository test — PrismaProcessedMessageRepository against a real test Postgres.
 * Phase 7.5: ProcessedMessage has @unique messageId.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@coldjot/database";
import { PrismaProcessedMessageRepository } from "@/repositories/prisma/prisma-processed-message.repo";

const repo = new PrismaProcessedMessageRepository();
const SCOPE = "pmsg";

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  await prisma.processedMessage.deleteMany();
});

describe("PrismaProcessedMessageRepository", () => {
  it("create + findByMessageId round-trip", async () => {
    await repo.create({ messageId: "m-1", threadId: "t-1", type: "REPLY" });
    const found = await repo.findByMessageId("m-1");
    expect(found).not.toBeNull();
    expect(found!.type).toBe("REPLY");
    expect(await repo.findByMessageId("absent")).toBeNull();
  });

  it("hasOriginalForThread returns true when any row shares the thread", async () => {
    await repo.create({ messageId: "m-2", threadId: "t-shared", type: "ORIGINAL" });
    expect(await repo.hasOriginalForThread("t-shared")).toBe(true);
    expect(await repo.hasOriginalForThread("t-empty")).toBe(false);
  });
});
