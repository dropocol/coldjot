/**
 * Repository test — PrismaEmailTrackingRepository against a real test Postgres.
 *
 * Phase 7.5: these are the only tests that catch Prisma-specific bugs (typos in
 * field names, missing `include`, wrong relation shape). They run in the slow
 * `test:integration` tier; the DB is truncated in `beforeEach` so order doesn't
 * matter. Requires DATABASE_URL_TEST → a live `coldjot_test` database with
 * migrations applied.
 *
 * This file is the representative for the aggregate; the remaining 19
 * `Prisma*Repository` classes follow the same pattern (per the 7.5 sub-plan).
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@coldjot/database";
import { EmailEventEnum } from "@coldjot/types";
import { PrismaEmailTrackingRepository } from "@/repositories/prisma/prisma-email-tracking.repo";

const repo = new PrismaEmailTrackingRepository();
const USER_ID = "test-user-emailtracking";
const SEQ_ID = "test-seq-emailtracking";
const CONTACT_ID = "test-contact-emailtracking";

// Truncate the tables this suite touches. Order matters for FKs — children first.
// The seed parents (User/Sequence/Contact) are created once in beforeAll and
// left in place; only the EmailTracking/EmailEvent rows are wiped per test.
async function truncate() {
  await prisma.emailEvent.deleteMany();
  await prisma.emailTracking.deleteMany();
}

beforeAll(async () => {
  // Confirm the DB is reachable; fail fast with a clear message if not.
  await prisma.$queryRaw`SELECT 1`;
  // Seed the FK parents EmailTracking + EmailEvent reference.
  await prisma.user.upsert({
    where: { id: USER_ID },
    update: {},
    create: { id: USER_ID, email: "test-emailtracking@example.com" },
  });
  await prisma.sequence.upsert({
    where: { id: SEQ_ID },
    update: {},
    create: { id: SEQ_ID, name: "test seq", userId: USER_ID },
  });
  await prisma.contact.upsert({
    where: { id: CONTACT_ID },
    update: {},
    create: {
      id: CONTACT_ID,
      firstName: "Ada",
      lastName: "L",
      name: "Ada L",
      email: "ada@example.com",
      userId: USER_ID,
    },
  });
});

beforeEach(async () => {
  await truncate();
});

describe("PrismaEmailTrackingRepository", () => {
  // EmailTracking has FKs on userId (required) + sequenceId/stepId/contactId
  // (nullable). Seed parents for the ones we exercise (sequenceId, contactId);
  // stepId is left null (no SequenceStep seeded). Cast through the interface
  // because CreatePendingInput marks stepId required even though the column is
  // nullable.
  const baseInput = {
    hash: "hash-1",
    userId: USER_ID,
    sequenceId: SEQ_ID,
    contactId: CONTACT_ID,
    metadata: { email: "dest@example.com" } as any,
  } as unknown as import("@/repositories/email-tracking.repo").CreatePendingInput;

  it("createPending writes a row at status=pending with openCount 0", async () => {
    const row = await repo.createPending(baseInput);
    expect(row.status).toBe("pending");
    expect(row.openCount).toBe(0);
    expect(row.hash).toBe("hash-1");
    // Round-trip via findByHash.
    const found = await repo.findByHash("hash-1");
    expect(found?.id).toBe(row.id);
  });

  it("createPending with messageId writes the nested SENT event", async () => {
    await repo.createPending({
      ...baseInput,
      hash: "hash-2",
      messageId: "msg-2",
      threadId: "thr-2",
      status: "SENT",
    });
    const found = await repo.findWithOpenEvents("hash-2");
    expect(found).not.toBeNull();
    const sent = await prisma.emailEvent.findFirst({
      where: { trackingId: found!.id, type: EmailEventEnum.SENT },
    });
    expect(sent).not.toBeNull();
  });

  it("markSent updates status to SENT + writes a SENT event", async () => {
    const row = await repo.createPending(baseInput);
    await repo.markSent(row.id, { messageId: "m1", threadId: "t1" }, "Hello", SEQ_ID, CONTACT_ID, {
      messageId: "m1",
    });
    const after = await repo.findById(row.id);
    expect(after?.status).toBe("sent");
    expect(after?.messageId).toBe("m1");
    expect(after?.threadId).toBe("t1");
    const sent = await prisma.emailEvent.findFirst({
      where: { trackingId: row.id, type: EmailEventEnum.SENT },
    });
    expect(sent).not.toBeNull();
  });

  it("recordOpen increments openCount + writes an OPENED event + sets OPENED status", async () => {
    const row = await repo.createPending(baseInput);
    await repo.recordOpen("hash-1", SEQ_ID, CONTACT_ID, { openCount: 1, isFirstOpen: true });
    const after = await repo.findById(row.id);
    expect(after?.openCount).toBe(1);
    expect(after?.status).toBe("opened");
    const opened = await prisma.emailEvent.findFirst({
      where: { trackingId: row.id, type: EmailEventEnum.OPENED },
    });
    expect(opened).not.toBeNull();
  });

  it("countByThread counts rows sharing a threadId", async () => {
    await repo.createPending({ ...baseInput, hash: "h-a", threadId: "t-shared" });
    await repo.createPending({ ...baseInput, hash: "h-b", threadId: "t-shared" });
    await repo.createPending({ ...baseInput, hash: "h-c", threadId: "other" });
    expect(await repo.countByThread("t-shared")).toBe(2);
    expect(await repo.countByThread("other")).toBe(1);
  });

  it("findEarliestSubjectInThread returns the subject of the oldest non-empty row", async () => {
    await repo.createPending({ ...baseInput, hash: "h-1", threadId: "t", subject: "second", metadata: {} as any });
    await new Promise((r) => setTimeout(r, 20));
    await repo.createPending({ ...baseInput, hash: "h-2", threadId: "t", subject: "", metadata: {} as any });
    await new Promise((r) => setTimeout(r, 20));
    await repo.createPending({ ...baseInput, hash: "h-3", threadId: "t", subject: "first-nonempty", metadata: {} as any });
    expect(await repo.findEarliestSubjectInThread("t")).toBe("second");
  });

  it("deleteBySequence removes rows whose metadata.sequenceId matches", async () => {
    await repo.createPending({
      ...baseInput,
      hash: "h-del",
      metadata: { sequenceId: SEQ_ID } as any,
    });
    await repo.createPending({
      ...baseInput,
      hash: "h-keep",
      metadata: { sequenceId: "other-seq-not-deleted" } as any,
    });
    await repo.deleteBySequence(SEQ_ID);
    expect(await repo.findByHash("h-del")).toBeNull();
    expect(await repo.findByHash("h-keep")).not.toBeNull();
  });
});
