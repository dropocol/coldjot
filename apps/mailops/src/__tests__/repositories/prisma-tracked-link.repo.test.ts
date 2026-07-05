/**
 * Repository test — PrismaTrackedLinkRepository against a real test Postgres.
 * Phase 7.5: TrackedLink has a required FK on emailTrackingId.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@coldjot/database";
import { PrismaTrackedLinkRepository } from "@/repositories/prisma/prisma-tracked-link.repo";
import {
  seedUser,
  seedEmailTracking,
} from "../helpers/seed";

const repo = new PrismaTrackedLinkRepository();
const SCOPE = "tlink";

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

describe("PrismaTrackedLinkRepository", () => {
  it("create writes a link with clickCount 0", async () => {
    const row = await repo.create({
      emailTrackingId: TRACKING_ID,
      originalUrl: "https://example.com",
    });
    expect(row.emailTrackingId).toBe(TRACKING_ID);
    expect(row.clickCount).toBe(0);
  });

  it("findWithTracking returns the link + its parent tracking", async () => {
    const link = await repo.create({
      emailTrackingId: TRACKING_ID,
      originalUrl: "https://example.com",
    });
    const found = await repo.findWithTracking(link.id);
    expect(found).not.toBeNull();
    expect(found!.originalUrl).toBe("https://example.com");
    expect(found!.emailTracking.id).toBe(TRACKING_ID);
    expect(await repo.findWithTracking("no-such-id")).toBeNull();
  });

  it("incrementClickCount bumps clickCount + updatedAt", async () => {
    const link = await repo.create({
      emailTrackingId: TRACKING_ID,
      originalUrl: "https://example.com",
    });
    const at = new Date();
    await repo.incrementClickCount(link.id, at);
    const after = await prisma.trackedLink.findUnique({ where: { id: link.id } });
    expect(after?.clickCount).toBe(1);
  });
});
