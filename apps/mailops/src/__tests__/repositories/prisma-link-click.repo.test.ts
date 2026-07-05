/**
 * Repository test — PrismaLinkClickRepository against a real test Postgres.
 * Phase 7.5: LinkClick has a required FK on trackedLinkId.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@coldjot/database";
import { PrismaLinkClickRepository } from "@/repositories/prisma/prisma-link-click.repo";
import {
  seedUser,
  seedEmailTracking,
} from "../helpers/seed";

const repo = new PrismaLinkClickRepository();
const SCOPE = "click";

let USER_ID: string;
let TRACKING_ID: string;

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  USER_ID = `${SCOPE}-user`;
  await seedUser(USER_ID);
});

beforeEach(async () => {
  await prisma.linkClick.deleteMany();
  await prisma.trackedLink.deleteMany();
  await prisma.emailTracking.deleteMany();
  TRACKING_ID = (await seedEmailTracking(`${SCOPE}-hash-${Date.now()}`, USER_ID)).id;
});

describe("PrismaLinkClickRepository", () => {
  it("create writes a click row linked to the tracked link", async () => {
    const link = await prisma.trackedLink.create({
      data: { emailTrackingId: TRACKING_ID, originalUrl: "https://example.com" },
    });
    const at = new Date();
    const row = await repo.create(link.id, at);
    expect(row.trackedLinkId).toBe(link.id);
  });
});
