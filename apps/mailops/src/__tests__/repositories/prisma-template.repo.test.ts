/**
 * Repository test — PrismaTemplateRepository against a real test Postgres.
 * Phase 7.5: Template is a top-level aggregate (FK on userId).
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@coldjot/database";
import { PrismaTemplateRepository } from "@/repositories/prisma/prisma-template.repo";
import { seedUser, seedTemplate } from "../helpers/seed";

const repo = new PrismaTemplateRepository();
const SCOPE = "tmpl";

let USER_ID: string;

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  USER_ID = `${SCOPE}-user`;
  await seedUser(USER_ID);
});

beforeEach(async () => {
  await prisma.template.deleteMany();
});

describe("PrismaTemplateRepository", () => {
  it("findSubject returns just the subject", async () => {
    await seedTemplate(`${SCOPE}-1`, USER_ID, { subject: "Hello there" });
    expect(await repo.findSubject(`${SCOPE}-1`)).toBe("Hello there");
  });

  it("findSubject returns null when the template is absent", async () => {
    expect(await repo.findSubject("no-such-template")).toBeNull();
  });

  it("findById returns subject + content", async () => {
    await seedTemplate(`${SCOPE}-2`, USER_ID, {
      subject: "Subj",
      content: "Body",
    });
    const found = await repo.findById(`${SCOPE}-2`);
    expect(found).not.toBeNull();
    expect(found!.subject).toBe("Subj");
    expect(found!.content).toBe("Body");
  });
});
