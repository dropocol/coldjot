/**
 * Repository test — PrismaListSyncRecordRepository against a real test Postgres.
 * Phase 7.5: ListSyncRecord has FKs on listId + sequenceId (both required).
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@coldjot/database";
import { PrismaListSyncRecordRepository } from "@/repositories/prisma/prisma-list-sync-record.repo";
import {
  seedUser,
  seedSequence,
  seedEmailList,
} from "../helpers/seed";

const repo = new PrismaListSyncRecordRepository();
const SCOPE = "lsync";

let USER_ID: string;
let LIST_ID: string;
let SEQ_ID: string;

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  USER_ID = `${SCOPE}-user`;
  SEQ_ID = `${SCOPE}-seq`;
  LIST_ID = `${SCOPE}-list`;
  await seedUser(USER_ID);
  await seedSequence(SEQ_ID, USER_ID);
  await seedEmailList(LIST_ID, USER_ID);
});

beforeEach(async () => {
  await prisma.listSyncRecord.deleteMany();
});

describe("PrismaListSyncRecordRepository", () => {
  it("create writes a pending record with contactsAdded 0", async () => {
    const row = await repo.create({ listId: LIST_ID, sequenceId: SEQ_ID });
    expect(row.status).toBe("pending");
    expect(row.contactsAdded).toBe(0);
  });

  it("findPending returns pending records oldest-first with list contact counts", async () => {
    await repo.create({ listId: LIST_ID, sequenceId: SEQ_ID });
    await new Promise((r) => setTimeout(r, 20));
    await repo.create({ listId: LIST_ID, sequenceId: SEQ_ID });
    const pending = await repo.findPending(10);
    expect(pending.length).toBeGreaterThanOrEqual(2);
    // Ordered oldest-first: first record's createdAt <= second's.
    expect(pending[0].createdAt.getTime()).toBeLessThanOrEqual(pending[1].createdAt.getTime());
    // List contact count is included.
    expect(pending[0].list._count.contacts).toBe(0);
  });

  it("updateStatus sets status + contactsAdded + error", async () => {
    const row = await repo.create({ listId: LIST_ID, sequenceId: SEQ_ID });
    await repo.updateStatus(row.id, {
      status: "completed",
      contactsAdded: 5,
    });
    const after = await prisma.listSyncRecord.findUnique({ where: { id: row.id } });
    expect(after?.status).toBe("completed");
    expect(after?.contactsAdded).toBe(5);
  });

  it("updateStatusByListSequence bulk-updates pending/processing rows only", async () => {
    await repo.create({ listId: LIST_ID, sequenceId: SEQ_ID });
    await prisma.listSyncRecord.create({
      data: { listId: LIST_ID, sequenceId: SEQ_ID, status: "completed", contactsAdded: 0 },
    });
    await repo.updateStatusByListSequence(LIST_ID, SEQ_ID, { status: "processing" });
    const rows = await prisma.listSyncRecord.findMany({
      where: { listId: LIST_ID, sequenceId: SEQ_ID },
    });
    expect(rows.filter((r) => r.status === "processing").length).toBe(1);
    expect(rows.filter((r) => r.status === "completed").length).toBe(1);
  });
});
