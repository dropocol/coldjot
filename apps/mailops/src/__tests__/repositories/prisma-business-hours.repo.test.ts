/**
 * Repository test — PrismaBusinessHoursRepository against a real test Postgres.
 * Phase 7.5: BusinessHours has FKs on userId (required) + sequenceId (nullable, @unique).
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@coldjot/database";
import { PrismaBusinessHoursRepository } from "@/repositories/prisma/prisma-business-hours.repo";
import { seedUser, seedSequence } from "../helpers/seed";

const repo = new PrismaBusinessHoursRepository();
const SCOPE = "bhours";

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
  await prisma.businessHours.deleteMany();
});

const defaults = {
  timezone: "UTC",
  workDays: [1, 2, 3, 4, 5],
  workHoursStart: "09:00",
  workHoursEnd: "17:00",
  type: "business" as any,
};

describe("PrismaBusinessHoursRepository", () => {
  it("createForSequence writes the defaults", async () => {
    const row = (await repo.createForSequence(USER_ID, SEQ_ID, defaults)) as any;
    expect(row.timezone).toBe("UTC");
    expect(row.sequenceId).toBe(SEQ_ID);
  });

  it("findBySequence returns the row by userId + sequenceId", async () => {
    await repo.createForSequence(USER_ID, SEQ_ID, defaults);
    const found = await repo.findBySequence(USER_ID, SEQ_ID);
    expect(found).not.toBeNull();
    expect(found!.workHoursStart).toBe("09:00");
    expect(await repo.findBySequence(USER_ID, "other-seq")).toBeNull();
  });
});
