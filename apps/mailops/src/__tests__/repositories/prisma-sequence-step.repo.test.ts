/**
 * Repository test — PrismaSequenceStepRepository against a real test Postgres.
 * Phase 7.5: SequenceStep has a required FK on sequenceId.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@coldjot/database";
import { PrismaSequenceStepRepository } from "@/repositories/prisma/prisma-sequence-step.repo";
import { seedUser, seedSequence, seedSequenceStep } from "../helpers/seed";

const repo = new PrismaSequenceStepRepository();
const SCOPE = "step";

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
  await prisma.sequenceStep.deleteMany();
});

describe("PrismaSequenceStepRepository", () => {
  it("findBySequenceAndOrder matches the sequence+order pair", async () => {
    await seedSequenceStep(`${SCOPE}-1`, SEQ_ID, 1);
    const found = await repo.findBySequenceAndOrder(SEQ_ID, 1);
    expect(found).not.toBeNull();
    expect(await repo.findBySequenceAndOrder(SEQ_ID, 2)).toBeNull();
  });

  it("findWithSequenceMeta returns the step + its sequence metadata", async () => {
    await seedSequenceStep(`${SCOPE}-2`, SEQ_ID, 1);
    const found = await repo.findWithSequenceMeta(`${SCOPE}-2`);
    expect(found).not.toBeNull();
    expect(found!.sequence.id).toBe(SEQ_ID);
    expect(found!.sequence.userId).toBe(USER_ID);
    expect(await repo.findWithSequenceMeta("no-such-step")).toBeNull();
  });

  it("countInSequence counts steps in the sequence", async () => {
    await seedSequenceStep(`${SCOPE}-3`, SEQ_ID, 1);
    await seedSequenceStep(`${SCOPE}-4`, SEQ_ID, 2);
    expect(await repo.countInSequence(SEQ_ID)).toBe(2);
  });

  it("listBySequence returns steps in order", async () => {
    await seedSequenceStep(`${SCOPE}-5`, SEQ_ID, 2);
    await seedSequenceStep(`${SCOPE}-6`, SEQ_ID, 1);
    const rows = await repo.listBySequence(SEQ_ID);
    expect(rows.map((r) => r.order)).toEqual([1, 2]);
  });
});
