/**
 * Repository test — PrismaEmailThreadRepository against a real test Postgres.
 * Phase 7.5: EmailThread has FKs on userId + sequenceId + contactId (all required),
 * plus a @unique threadId.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@coldjot/database";
import { PrismaEmailThreadRepository } from "@/repositories/prisma/prisma-email-thread.repo";
import {
  seedUser,
  seedSequence,
  seedContact,
} from "../helpers/seed";

const repo = new PrismaEmailThreadRepository();
const SCOPE = "thread";

let USER_ID: string;
let SEQ_ID: string;
let CONTACT_ID: string;

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  USER_ID = `${SCOPE}-user`;
  SEQ_ID = `${SCOPE}-seq`;
  CONTACT_ID = `${SCOPE}-contact`;
  await seedUser(USER_ID);
  await seedSequence(SEQ_ID, USER_ID);
  await seedContact(CONTACT_ID, USER_ID);
});

beforeEach(async () => {
  await prisma.emailThread.deleteMany();
});

describe("PrismaEmailThreadRepository", () => {
  it("create + findByThread round-trips the row", async () => {
    await repo.create({
      threadId: "thr-1",
      sequenceId: SEQ_ID,
      contactId: CONTACT_ID,
      userId: USER_ID,
      firstMessageId: "msg-1",
      subject: "Hello",
    });
    const found = await repo.findByThread("thr-1");
    expect(found).not.toBeNull();
    expect(found!.subject).toBe("Hello");
    expect(await repo.findByThread("no-such")).toBeNull();
  });

  it("findByThread with withSequence joins the parent sequence", async () => {
    await repo.create({
      threadId: "thr-2",
      sequenceId: SEQ_ID,
      contactId: CONTACT_ID,
      userId: USER_ID,
      firstMessageId: "msg-2",
      subject: "Hi",
    });
    const found = await repo.findByThread("thr-2", true);
    expect(found).not.toBeNull();
    expect((found as any).sequence.userId).toBe(USER_ID);
  });

  it("findSubjectByThread returns just the subject", async () => {
    await repo.create({
      threadId: "thr-3",
      sequenceId: SEQ_ID,
      contactId: CONTACT_ID,
      userId: USER_ID,
      firstMessageId: "msg-3",
      subject: "Subject here",
    });
    expect(await repo.findSubjectByThread("thr-3")).toBe("Subject here");
    expect(await repo.findSubjectByThread("no-such")).toBeNull();
  });

  it("findSequenceContactByThread returns sequenceId + contactId", async () => {
    await repo.create({
      threadId: "thr-4",
      sequenceId: SEQ_ID,
      contactId: CONTACT_ID,
      userId: USER_ID,
      firstMessageId: "msg-4",
      subject: "x",
    });
    const res = await repo.findSequenceContactByThread("thr-4");
    expect(res).toEqual({ sequenceId: SEQ_ID, contactId: CONTACT_ID });
  });

  it("updateCheckMetadata writes lastCheckedAt + metadata", async () => {
    await repo.create({
      threadId: "thr-5",
      sequenceId: SEQ_ID,
      contactId: CONTACT_ID,
      userId: USER_ID,
      firstMessageId: "msg-5",
      subject: "x",
    });
    const at = new Date();
    await repo.updateCheckMetadata("thr-5", at, { checked: true });
    const after = await prisma.emailThread.findUnique({ where: { threadId: "thr-5" } });
    expect(after?.lastCheckedAt).toEqual(at);
  });

  it("markCompleted merges existing metadata with a COMPLETED status", async () => {
    await repo.create({
      threadId: "thr-6",
      sequenceId: SEQ_ID,
      contactId: CONTACT_ID,
      userId: USER_ID,
      firstMessageId: "msg-6",
      subject: "x",
    });
    await repo.markCompleted("thr-6", { foo: 1 }, "no-mailbox", new Date());
    const after = await prisma.emailThread.findUnique({ where: { threadId: "thr-6" } });
    expect((after?.metadata as any)?.status).toBe("COMPLETED");
    expect((after?.metadata as any)?.foo).toBe(1);
    expect((after?.metadata as any)?.reason).toBe("no-mailbox");
  });
});
