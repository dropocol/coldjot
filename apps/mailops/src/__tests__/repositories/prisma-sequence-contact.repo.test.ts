/**
 * Repository test — PrismaSequenceContactRepository against a real test Postgres.
 * Phase 7.5: composite unique (sequenceId, contactId). Many methods; covers the
 * composite-unique access, polling queries, and the reset/bulk paths.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@coldjot/database";
import { SequenceStatus } from "@coldjot/types";
import { PrismaSequenceContactRepository } from "@/repositories/prisma/prisma-sequence-contact.repo";
import {
  seedUser,
  seedSequence,
  seedContact,
  seedSequenceStep,
} from "../helpers/seed";

const repo = new PrismaSequenceContactRepository();
const SCOPE = "seqcontact";

let USER_ID: string;
let SEQ_ID: string;
let CONTACT_ID: string;

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  USER_ID = `${SCOPE}-user`;
  SEQ_ID = `${SCOPE}-seq`;
  CONTACT_ID = `${SCOPE}-contact`;
  await seedUser(USER_ID);
  await seedSequence(SEQ_ID, USER_ID, { status: SequenceStatus.ACTIVE });
  await seedContact(CONTACT_ID, USER_ID);
  await seedSequenceStep(`${SCOPE}-step-1`, SEQ_ID, 1);
});

beforeEach(async () => {
  // Scope the wipe to this suite's rows — integration files share one DB.
  await prisma.sequenceContact.deleteMany({
    where: { sequenceId: SEQ_ID },
  });
});

/**
 * Link a contact to the suite's sequence. Seeds the contact row first (the
 * FK graph requires it) so callers can pass any fresh contactId.
 */
async function link(
  contactId: string,
  overrides: Record<string, unknown> = {}
) {
  await seedContact(contactId, USER_ID);
  return prisma.sequenceContact.create({
    data: {
      sequenceId: SEQ_ID,
      contactId,
      status: "in_progress",
      ...overrides,
    } as any,
  });
}

describe("PrismaSequenceContactRepository", () => {
  it("findBySequenceAndContact uses the composite unique", async () => {
    await link(CONTACT_ID);
    expect(await repo.findBySequenceAndContact(SEQ_ID, CONTACT_ID)).not.toBeNull();
    expect(await repo.findBySequenceAndContact(SEQ_ID, "other")).toBeNull();
  });

  it("findThreadId returns the threadId", async () => {
    await link(CONTACT_ID, { threadId: "thr-1" });
    expect(await repo.findThreadId(SEQ_ID, CONTACT_ID)).toBe("thr-1");
    expect(await repo.findThreadId(SEQ_ID, "other")).toBeNull();
  });

  it("updateBySequenceAndContact updates fields via composite unique", async () => {
    await link(CONTACT_ID);
    await repo.updateBySequenceAndContact(SEQ_ID, CONTACT_ID, {
      status: "completed",
      completed: true,
      threadId: "thr-x",
    });
    const after = await repo.findBySequenceAndContact(SEQ_ID, CONTACT_ID);
    expect(after!.status).toBe("completed");
    expect(after!.completed).toBe(true);
    expect(after!.threadId).toBe("thr-x");
    expect(after!.completedAt).not.toBeNull();
  });

  it("upsertProgress creates then updates a contact's progress", async () => {
    const at = new Date();
    await repo.upsertProgress(SEQ_ID, CONTACT_ID, {
      currentStep: 1,
      lastProcessedAt: at,
      nextScheduledAt: at,
    });
    let row = await repo.findBySequenceAndContact(SEQ_ID, CONTACT_ID);
    expect(row!.currentStep).toBe(1);
    await repo.upsertProgress(SEQ_ID, CONTACT_ID, {
      currentStep: 2,
      lastProcessedAt: at,
      nextScheduledAt: null,
    });
    row = await repo.findBySequenceAndContact(SEQ_ID, CONTACT_ID);
    expect(row!.currentStep).toBe(2);
    expect(row!.nextScheduledAt).toBeNull();
  });

  it("updateById updates by the row's own id", async () => {
    const row = await link(CONTACT_ID);
    await repo.updateById(row.id, { failureCount: 3, lastError: "boom" });
    const after = await repo.findBySequenceAndContact(SEQ_ID, CONTACT_ID);
    expect(after!.failureCount).toBe(3);
    expect(after!.lastError).toBe("boom");
  });

  it("markTerminalBySequenceContact only updates non-terminal rows + returns count", async () => {
    await link(CONTACT_ID, { status: "in_progress" });
    await link(`${SCOPE}-c2`, { status: "completed" });
    const res = await repo.markTerminalBySequenceContact(SEQ_ID, CONTACT_ID, {
      status: "bounced",
      completed: true,
      completedAt: new Date(),
    });
    expect(res.count).toBe(1);
    const after = await repo.findBySequenceAndContact(SEQ_ID, CONTACT_ID);
    expect(after!.status).toBe("bounced");
  });

  it("addContactsToSequence bulk-inserts (skipDuplicates) + listContactIdsInSequence", async () => {
    const c1 = `${SCOPE}-list-1`;
    const c2 = `${SCOPE}-list-2`;
    await seedContact(c1, USER_ID);
    await seedContact(c2, USER_ID);
    await repo.addContactsToSequence(SEQ_ID, [c1, c2]);
    // Re-adding is a no-op (skipDuplicates).
    await repo.addContactsToSequence(SEQ_ID, [c1]);
    const ids = await repo.listContactIdsInSequence(SEQ_ID);
    expect(ids.sort()).toEqual([c1, c2].sort());
  });

  it("resetBySequence clears progress for all rows in the sequence", async () => {
    await link(CONTACT_ID, { status: "in_progress", currentStep: 2, threadId: "thr" });
    await repo.resetBySequence(SEQ_ID);
    const after = await repo.findBySequenceAndContact(SEQ_ID, CONTACT_ID);
    expect(after!.status).toBe("pending");
    expect(after!.currentStep).toBe(0);
    expect(after!.threadId).toBeNull();
  });

  it("countScheduledInWindow counts rows with nextScheduledAt in [start, end)", async () => {
    const start = new Date(2000, 0, 1, 10, 0, 0);
    const end = new Date(2000, 0, 1, 11, 0, 0);
    await link(CONTACT_ID, { nextScheduledAt: new Date(2000, 0, 1, 10, 30, 0) });
    await link(`${SCOPE}-c-out`, { nextScheduledAt: new Date(2000, 0, 1, 12, 0, 0) });
    expect(await repo.countScheduledInWindow(start, end)).toBe(1);
  });
});
