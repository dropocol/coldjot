/**
 * Repository test — PrismaMailboxRepository against a real test Postgres.
 * Phase 7.5: Mailbox + EmailAlias + SequenceMailbox (the join table that binds
 * a mailbox + optional alias to a sequence). @@unique([userId, email]).
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@coldjot/database";
import { PrismaMailboxRepository } from "@/repositories/prisma/prisma-mailbox.repo";
import {
  seedUser,
  seedSequence,
  seedMailbox,
} from "../helpers/seed";

const repo = new PrismaMailboxRepository();
const SCOPE = "mbox";

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
  await prisma.sequenceMailbox.deleteMany();
  await prisma.emailAlias.deleteMany();
  await prisma.mailbox.deleteMany();
});

describe("PrismaMailboxRepository", () => {
  it("findWithAliases returns mailbox + its aliases", async () => {
    const mbox = await seedMailbox(`${SCOPE}-1`, USER_ID, "m1@example.com");
    await prisma.emailAlias.create({
      data: { mailboxId: mbox.id, alias: "alias1@example.com" },
    });
    const found = await repo.findWithAliases(mbox.id, USER_ID);
    expect(found).not.toBeNull();
    expect(found!.aliases).toHaveLength(1);
    expect(await repo.findWithAliases(mbox.id, "other-user")).toBeNull();
  });

  it("findByIdForUser returns mailbox without aliases", async () => {
    const mbox = await seedMailbox(`${SCOPE}-2`, USER_ID, "m2@example.com");
    const found = await repo.findByIdForUser(mbox.id, USER_ID);
    expect(found).not.toBeNull();
    expect((found as any).aliases).toBeUndefined();
  });

  it("findActiveGmail requires isActive + provider=gmail + userId", async () => {
    await seedMailbox(`${SCOPE}-3`, USER_ID, "m3@example.com", { isActive: true });
    await seedMailbox(`${SCOPE}-4`, USER_ID, "m4@example.com", { isActive: false });
    const found = await repo.findActiveGmail(USER_ID, "m3@example.com");
    expect(found).not.toBeNull();
    expect(await repo.findActiveGmail(USER_ID, "m4@example.com")).toBeNull();
  });

  it("findActiveGmailByEmail finds by email alone", async () => {
    await seedMailbox(`${SCOPE}-5`, USER_ID, "m5@example.com", { isActive: true });
    expect(await repo.findActiveGmailByEmail("m5@example.com")).not.toBeNull();
    expect(await repo.findActiveGmailByEmail("absent@example.com")).toBeNull();
  });

  it("findWithEmailAliases matches by email regardless of active state", async () => {
    await seedMailbox(`${SCOPE}-6`, USER_ID, "m6@example.com", { isActive: false });
    const found = await repo.findWithEmailAliases("m6@example.com");
    expect(found).not.toBeNull();
  });

  it("updateTokens writes access_token + expires_at (ms → seconds)", async () => {
    const mbox = await seedMailbox(`${SCOPE}-7`, USER_ID, "m7@example.com");
    await repo.updateTokens(mbox.id, "tok-123", 2_000_000);
    const after = await prisma.mailbox.findUnique({ where: { id: mbox.id } });
    expect(after?.access_token).toBe("tok-123");
    expect(after?.expires_at).toBe(2000);
  });

  it("updateTokens with 0 ms clears expires_at", async () => {
    const mbox = await seedMailbox(`${SCOPE}-8`, USER_ID, "m8@example.com", { expires_at: 1000 });
    await repo.updateTokens(mbox.id, "tok", 0);
    const after = await prisma.mailbox.findUnique({ where: { id: mbox.id } });
    expect(after?.expires_at).toBeNull();
  });

  // -- SequenceMailbox join table ------------------------------------------

  it("findSequenceMailboxId returns the bound mailboxId for a sequence", async () => {
    const mbox = await seedMailbox(`${SCOPE}-9`, USER_ID, "m9@example.com");
    await prisma.sequenceMailbox.create({
      data: { sequenceId: SEQ_ID, mailboxId: mbox.id, userId: USER_ID },
    });
    expect(await repo.findSequenceMailboxId(SEQ_ID)).toBe(mbox.id);
    expect(await repo.findSequenceMailboxId("other-seq")).toBeNull();
  });

  it("findSequenceMailboxById returns the row with mailbox + alias joined", async () => {
    const mbox = await seedMailbox(`${SCOPE}-10`, USER_ID, "m10@example.com");
    const sm = await prisma.sequenceMailbox.create({
      data: { sequenceId: SEQ_ID, mailboxId: mbox.id, userId: USER_ID },
    });
    const found = await repo.findSequenceMailboxById(sm.id);
    expect(found).not.toBeNull();
    expect(found!.mailbox.id).toBe(mbox.id);
  });
});
