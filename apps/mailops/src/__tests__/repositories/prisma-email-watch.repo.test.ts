/**
 * Repository test — PrismaEmailWatchRepository against a real test Postgres.
 * Phase 7.5: EmailWatch has @id (not auto) + @unique email.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@coldjot/database";
import { PrismaEmailWatchRepository } from "@/repositories/prisma/prisma-email-watch.repo";
import { seedUser } from "../helpers/seed";

const repo = new PrismaEmailWatchRepository();
const SCOPE = "watch";

let USER_ID: string;

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  USER_ID = `${SCOPE}-user`;
  await seedUser(USER_ID);
});

beforeEach(async () => {
  await prisma.emailWatchHistory.deleteMany();
  await prisma.emailWatch.deleteMany();
});

describe("PrismaEmailWatchRepository", () => {
  const baseInput = (n: number) => ({
    id: `${SCOPE}-watch-${n}`,
    userId: USER_ID,
    email: `w${n}@example.com`,
    historyId: `h-${n}`,
    expiration: new Date(2000, 0, n + 1),
  });

  it("create + findById + findByEmail round-trip", async () => {
    const row = await repo.create(baseInput(1));
    expect(row.id).toBe(`${SCOPE}-watch-1`);
    expect(await repo.findById(`${SCOPE}-watch-1`)).not.toBeNull();
    expect(await repo.findByEmail("w1@example.com")).not.toBeNull();
    expect(await repo.findByEmail("absent@example.com")).toBeNull();
  });

  it("findDueForRenewal returns watches at/before the buffer time", async () => {
    await repo.create(baseInput(2)); // expiration Jan 3
    await repo.create(baseInput(3)); // expiration Jan 4
    const due = await repo.findDueForRenewal(new Date(2000, 0, 3));
    expect(due.map((w) => w.id)).toContain(`${SCOPE}-watch-2`);
    expect(due.map((w) => w.id)).not.toContain(`${SCOPE}-watch-3`);
  });

  it("listAll returns every watch", async () => {
    await repo.create(baseInput(4));
    await repo.create(baseInput(5));
    expect((await repo.listAll()).length).toBeGreaterThanOrEqual(2);
  });

  it("updateById updates historyId + expiration", async () => {
    await repo.create(baseInput(6));
    const newExp = new Date(2030, 0, 1);
    await repo.updateById(`${SCOPE}-watch-6`, { historyId: "h-new", expiration: newExp });
    const after = await repo.findById(`${SCOPE}-watch-6`);
    expect(after!.historyId).toBe("h-new");
    expect(after!.expiration).toEqual(newExp);
  });

  it("updateByEmail updates by the unique email", async () => {
    await repo.create(baseInput(7));
    await repo.updateByEmail("w7@example.com", { historyId: "h-by-email" });
    const after = await repo.findByEmail("w7@example.com");
    expect(after!.historyId).toBe("h-by-email");
  });

  it("deleteByEmail removes the watch", async () => {
    await repo.create(baseInput(8));
    await repo.deleteByEmail("w8@example.com");
    expect(await repo.findByEmail("w8@example.com")).toBeNull();
  });
});
