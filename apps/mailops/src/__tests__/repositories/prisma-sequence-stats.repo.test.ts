/**
 * Repository test — PrismaSequenceStatsRepository against a real test Postgres.
 * Phase 7.5: SequenceStats has a @unique sequenceId + optional contactId.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@coldjot/database";
import { PrismaSequenceStatsRepository } from "@/repositories/prisma/prisma-sequence-stats.repo";
import { seedUser, seedSequence } from "../helpers/seed";

const repo = new PrismaSequenceStatsRepository();
const SCOPE = "stats";

let USER_ID: string;
let SEQ_ID: string;

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  USER_ID = `${SCOPE}-user`;
  SEQ_ID = `${SCOPE}-seq`;
  await seedUser(USER_ID);
  await seedSequence(SEQ_ID, USER_ID);
});

beforeEach(async () => {
  await prisma.sequenceStats.deleteMany();
});

describe("PrismaSequenceStatsRepository", () => {
  it("createForSequence writes a zeroed row", async () => {
    const row = await repo.createForSequence(SEQ_ID);
    expect(row.sequenceId).toBe(SEQ_ID);
    expect(row.totalEmails).toBe(0);
    expect(row.sentEmails).toBe(0);
  });

  it("getBySequence finds the row (findFirst by sequenceId)", async () => {
    await repo.createForSequence(SEQ_ID);
    expect(await repo.getBySequence(SEQ_ID)).not.toBeNull();
    expect(await repo.getBySequence("other-seq")).toBeNull();
  });

  it("updateCounts increments the requested counters", async () => {
    await repo.createForSequence(SEQ_ID);
    await repo.updateCounts(SEQ_ID, {
      sentEmails: 1,
      openedEmails: 2,
      bouncedEmails: 1,
    });
    const after = await repo.getBySequence(SEQ_ID);
    expect(after!.sentEmails).toBe(1);
    expect(after!.openedEmails).toBe(2);
    expect(after!.bouncedEmails).toBe(1);
  });

  it("createWithValues writes explicit counts", async () => {
    const row = await repo.createWithValues({
      sequenceId: SEQ_ID,
      totalEmails: 5,
      sentEmails: 3,
    });
    expect(row.totalEmails).toBe(5);
    expect(row.sentEmails).toBe(3);
  });

  it("updateRaw applies an arbitrary data object", async () => {
    await repo.createForSequence(SEQ_ID);
    await repo.updateRaw(SEQ_ID, { sentEmails: 9 } as any);
    const after = await repo.getBySequence(SEQ_ID);
    expect(after!.sentEmails).toBe(9);
  });

  it("deleteBySequence removes the row", async () => {
    await repo.createForSequence(SEQ_ID);
    await repo.deleteBySequence(SEQ_ID);
    expect(await repo.getBySequence(SEQ_ID)).toBeNull();
  });
});
