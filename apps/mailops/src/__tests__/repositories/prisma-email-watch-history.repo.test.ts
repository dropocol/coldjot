/**
 * Repository test — PrismaEmailWatchHistoryRepository against a real test Postgres.
 * Phase 7.5: EmailWatchHistory has @id (not auto) + FK on emailWatchId.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@coldjot/database";
import { PrismaEmailWatchHistoryRepository } from "@/repositories/prisma/prisma-email-watch-history.repo";
import { seedUser } from "../helpers/seed";

const repo = new PrismaEmailWatchHistoryRepository();
const SCOPE = "whist";

let USER_ID: string;
let WATCH_ID: string;

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  USER_ID = `${SCOPE}-user`;
  await seedUser(USER_ID);
  WATCH_ID = `${SCOPE}-watch`;
  await prisma.emailWatch.upsert({
    where: { id: WATCH_ID },
    update: {},
    create: {
      id: WATCH_ID,
      userId: USER_ID,
      email: `${SCOPE}@example.com`,
      historyId: "h0",
      expiration: new Date(2030, 0, 1),
    },
  });
});

beforeEach(async () => {
  await prisma.emailWatchHistory.deleteMany();
});

describe("PrismaEmailWatchHistoryRepository", () => {
  const baseInput = (n: number) => ({
    id: `${SCOPE}-hist-${n}`,
    emailWatchId: WATCH_ID,
    historyId: `h-${n}`,
    notificationType: "type-a",
    processed: false,
    data: { n } as any,
  });

  it("create + findProcessed (false → not found)", async () => {
    await repo.create(baseInput(1));
    expect(await repo.findProcessed(WATCH_ID, "h-1")).toBeNull();
  });

  it("markProcessed makes the record visible to findProcessed", async () => {
    await repo.create(baseInput(2));
    await repo.markProcessed(`${SCOPE}-hist-2`);
    const found = await repo.findProcessed(WATCH_ID, "h-2");
    expect(found).not.toBeNull();
    expect(found!.processed).toBe(true);
  });

  it("upsert creates then updates a record", async () => {
    await repo.upsert({ ...baseInput(3), notificationType: "first" });
    await repo.upsert({ ...baseInput(3), notificationType: "second" });
    const row = await prisma.emailWatchHistory.findUnique({ where: { id: `${SCOPE}-hist-3` } });
    expect(row?.notificationType).toBe("second");
  });

  it("purgeProcessedBefore deletes only processed rows older than the cutoff", async () => {
    await repo.create({ ...baseInput(4), processed: false });
    // Manually mark processed + backdate createdAt via raw update.
    await repo.markProcessed(`${SCOPE}-hist-4`);
    await prisma.emailWatchHistory.update({
      where: { id: `${SCOPE}-hist-4` },
      data: { createdAt: new Date(2000, 0, 1) },
    });
    const res = await repo.purgeProcessedBefore(new Date(2020, 0, 1));
    expect(res.count).toBe(1);
    expect(await prisma.emailWatchHistory.findUnique({ where: { id: `${SCOPE}-hist-4` } })).toBeNull();
  });
});
