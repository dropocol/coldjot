/**
 * Repository test — PrismaListRepository against a real test Postgres.
 * Phase 7.5: EmailList is a top-level aggregate (FK on userId) with a many-to-many
 * to Sequence ("SequenceToLists") and Contact ("EmailListContacts").
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@coldjot/database";
import { PrismaListRepository } from "@/repositories/prisma/prisma-list.repo";
import {
  seedUser,
  seedSequence,
  seedContact,
  seedEmailList,
} from "../helpers/seed";

const repo = new PrismaListRepository();
const SCOPE = "list";

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
});

beforeEach(async () => {
  await prisma.emailList.deleteMany();
  await seedEmailList(LIST_ID, USER_ID);
});

describe("PrismaListRepository", () => {
  it("contactCount returns the number of contacts on the list", async () => {
    const c1 = `${SCOPE}-c1`;
    const c2 = `${SCOPE}-c2`;
    await seedContact(c1, USER_ID);
    await seedContact(c2, USER_ID);
    await prisma.emailList.update({
      where: { id: LIST_ID },
      data: { contacts: { connect: [{ id: c1 }, { id: c2 }] } },
    });
    expect(await repo.contactCount(LIST_ID)).toBe(2);
    expect(await repo.contactCount("empty-list")).toBe(0);
  });

  it("findWithSequences returns the list + its attached sequence ids", async () => {
    await prisma.emailList.update({
      where: { id: LIST_ID },
      data: { sequences: { connect: { id: SEQ_ID } } },
    });
    const found = await repo.findWithSequences(LIST_ID);
    expect(found).not.toBeNull();
    expect(found!.sequences.map((s) => s.id)).toContain(SEQ_ID);
  });

  it("findContactsPage paginates contacts (take/skip)", async () => {
    const c1 = `${SCOPE}-p1`;
    const c2 = `${SCOPE}-p2`;
    const c3 = `${SCOPE}-p3`;
    await seedContact(c1, USER_ID);
    await seedContact(c2, USER_ID);
    await seedContact(c3, USER_ID);
    await prisma.emailList.update({
      where: { id: LIST_ID },
      data: { contacts: { connect: [{ id: c1 }, { id: c2 }, { id: c3 }] } },
    });
    const page = await repo.findContactsPage(LIST_ID, 2, 1);
    expect(page).toHaveLength(2);
  });
});
