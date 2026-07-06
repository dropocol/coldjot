/**
 * Repository test — PrismaSequenceRepository against a real test Postgres.
 * Phase 7.5: Sequence is a top-level aggregate (FK on userId).
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@coldjot/database";
import { PrismaSequenceRepository } from "@/repositories/prisma/prisma-sequence.repo";
import {
  seedUser,
  seedSequence,
  seedContact,
  seedSequenceStep,
} from "../helpers/seed";

const repo = new PrismaSequenceRepository();
const SCOPE = "seq";

let USER_ID: string;
let SEQ_ID: string;

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  USER_ID = `${SCOPE}-user`;
  SEQ_ID = `${SCOPE}-seq`;
  await seedUser(USER_ID);
  await seedSequence(SEQ_ID, USER_ID, { status: "draft" });
});

// Sequence is a parent of many tables; only touch the sequence row itself here.
beforeEach(async () => {
  await prisma.sequenceStep.deleteMany();
  await prisma.sequenceContact.deleteMany();
  await prisma.sequence.update({
    where: { id: SEQ_ID },
    data: { status: "draft", testMode: false, disableSending: false },
  });
});

describe("PrismaSequenceRepository", () => {
  it("findByIdForUser respects the userId ownership filter", async () => {
    expect(await repo.findByIdForUser(SEQ_ID, USER_ID)).not.toBeNull();
    expect(await repo.findByIdForUser(SEQ_ID, "other-user")).toBeNull();
  });

  it("findForLaunch returns steps + active contacts (excluded statuses filtered)", async () => {
    const contactId = `${SCOPE}-contact`;
    const bouncedContactId = `${SCOPE}-contact-bounced`;
    await seedContact(contactId, USER_ID);
    await seedContact(bouncedContactId, USER_ID);
    await prisma.sequenceContact.create({
      data: { sequenceId: SEQ_ID, contactId, status: "pending" },
    });
    await prisma.sequenceContact.create({
      data: { sequenceId: SEQ_ID, contactId: bouncedContactId, status: "bounced" },
    });
    await seedSequenceStep(`${SCOPE}-step-1`, SEQ_ID, 1);
    await seedSequenceStep(`${SCOPE}-step-2`, SEQ_ID, 2);

    const graph = await repo.findForLaunch(SEQ_ID, USER_ID, ["bounced"]);
    expect(graph).not.toBeNull();
    expect(graph!.steps.map((s) => s.order)).toEqual([1, 2]);
    expect(graph!.contacts).toHaveLength(1);
    expect(graph!.contacts[0].contact.email).toBe(`${contactId}@example.com`);
  });

  it("findWithDetails returns the sequence + steps + businessHours", async () => {
    await seedSequenceStep(`${SCOPE}-step-d`, SEQ_ID, 1);
    const details = await repo.findWithDetails(SEQ_ID);
    expect(details).not.toBeNull();
    expect(details!.steps).toHaveLength(1);
    expect(details!.businessHours).toBeNull();
  });

  it("findWithBusinessHours returns just the businessHours relation", async () => {
    const row = await repo.findWithBusinessHours(SEQ_ID);
    expect(row).not.toBeNull();
    expect(row!.businessHours).toBeNull();
  });

  it("setStatus updates the status column", async () => {
    await repo.setStatus(SEQ_ID, "active");
    const after = await repo.findByIdForUser(SEQ_ID, USER_ID);
    expect(after!.status).toBe("active");
  });

  it("resetToDraft clears status + flags", async () => {
    await prisma.sequence.update({
      where: { id: SEQ_ID },
      data: { status: "active", testMode: true, disableSending: true },
    });
    await repo.resetToDraft(SEQ_ID);
    const after = await repo.findByIdForUser(SEQ_ID, USER_ID);
    expect(after!.status).toBe("draft");
    expect(after!.testMode).toBe(false);
    expect(after!.disableSending).toBe(false);
  });
});
