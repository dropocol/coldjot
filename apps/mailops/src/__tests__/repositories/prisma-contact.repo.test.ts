/**
 * Repository test — PrismaContactRepository against a real test Postgres.
 * Phase 7.5: Contact is a top-level aggregate (FK on userId).
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@coldjot/database";
import { PrismaContactRepository } from "@/repositories/prisma/prisma-contact.repo";
import { seedUser, seedContact } from "../helpers/seed";

const repo = new PrismaContactRepository();
const SCOPE = "contact";

let USER_ID: string;

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  USER_ID = `${SCOPE}-user`;
  await seedUser(USER_ID);
});

beforeEach(async () => {
  // Scope the wipe to this suite's contacts — integration files share one DB,
  // so a blanket deleteMany() would trip FKs from rows other suites seeded.
  await prisma.contact.deleteMany({ where: { id: { startsWith: `${SCOPE}-` } } });
});

describe("PrismaContactRepository", () => {
  it("findById returns the contact when it exists", async () => {
    await seedContact(`${SCOPE}-1`, USER_ID, "c1@example.com");
    const found = await repo.findById(`${SCOPE}-1`);
    expect(found).not.toBeNull();
    expect(found!.email).toBe("c1@example.com");
  });

  it("findById returns null when absent", async () => {
    expect(await repo.findById("no-such-contact")).toBeNull();
  });
});
