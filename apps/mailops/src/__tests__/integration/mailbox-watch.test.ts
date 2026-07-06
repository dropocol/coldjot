/**
 * Integration test — mailbox watch lifecycle (setup / stop).
 *
 * Phase 7.7 flow 10 (Group F): exercises the real WatchService → real Prisma
 * repos → real DB, with a fake WatchGateway + TokenRefresher standing in for
 * the Gmail REST surface. Asserts the watch row is created/updated/deleted
 * correctly and the gateway is called in the right order. Replaces the Group F
 * characterization test end-to-end.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@coldjot/database";
import { WatchService } from "@/services/watch";
import type { WatchGateway, ProfileResult } from "@/adapters/watch-gateway";
import type { TokenRefresher } from "@/adapters/token-refresher";
import { PrismaMailboxRepository } from "@/repositories/prisma/prisma-mailbox.repo";
import { PrismaEmailWatchRepository } from "@/repositories/prisma/prisma-email-watch.repo";
import { seedUser, seedMailbox } from "../helpers/seed";

const SCOPE = "it-watch";
let USER_ID: string;
const EMAIL = `${SCOPE}@example.com`;

/** Records gateway calls + returns canned responses. */
class FakeWatchGateway implements WatchGateway {
  calls: string[] = [];
  async getProfile(): Promise<ProfileResult> {
    this.calls.push("getProfile");
    return { historyId: "hist-1" };
  }
  async stop() {
    this.calls.push("stop");
  }
  async watch() {
    this.calls.push("watch");
    return { historyId: "hist-watch", expiration: "2030-01-01" } as any;
  }
  async createWatchRequest() {
    this.calls.push("createWatchRequest");
    return { historyId: "hist-renew", expiration: "2030-01-01" } as any;
  }
}

class FakeTokenRefresher implements TokenRefresher {
  async refreshIfNeeded() {
    return "fresh-token";
  }
}

const gateway = new FakeWatchGateway();
const service = new WatchService(
  gateway,
  new FakeTokenRefresher(),
  new PrismaMailboxRepository(),
  new PrismaEmailWatchRepository()
);

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  USER_ID = `${SCOPE}-user`;
  await seedUser(USER_ID);
  // Clean up any leftover mailbox from a prior run, then seed fresh.
  await prisma.mailbox.deleteMany({ where: { email: EMAIL } }).catch(() => {});
  // Seed a mailbox with OAuth tokens so stopWatch's getAccessToken proceeds.
  await seedMailbox(`${SCOPE}-mbox`, USER_ID, EMAIL, {
    access_token: "tok",
    refresh_token: "ref",
    expires_at: 2000000000, // epoch seconds (Int); ~2033
  });
});

beforeEach(async () => {
  gateway.calls = [];
  await prisma.emailWatch.deleteMany({ where: { email: EMAIL } });
});

describe("mailbox watch (WatchService vs real DB)", () => {
  it("setupWatch creates a watch row + calls the gateway in order (getProfile → stop → watch)", async () => {
    await service.setupWatch({
      userId: USER_ID,
      email: EMAIL,
      accessToken: "tok",
      refreshToken: "ref",
      expiresAt: 9999999999,
    });

    expect(gateway.calls).toEqual(["getProfile", "stop", "watch"]);

    const watch = await prisma.emailWatch.findUnique({ where: { email: EMAIL } });
    expect(watch).not.toBeNull();
    expect(watch!.historyId).toBe("hist-1");
    expect(watch!.userId).toBe(USER_ID);
  });

  it("setupWatch on an existing watch updates it in place (no duplicate row)", async () => {
    await prisma.emailWatch.create({
      data: {
        id: `${SCOPE}-existing`,
        userId: USER_ID,
        email: EMAIL,
        historyId: "old",
        expiration: new Date(2025, 0, 1),
      },
    });

    await service.setupWatch({
      userId: USER_ID,
      email: EMAIL,
      accessToken: "tok",
    });

    const count = await prisma.emailWatch.count({ where: { email: EMAIL } });
    expect(count).toBe(1);
    const watch = await prisma.emailWatch.findUnique({ where: { email: EMAIL } });
    expect(watch?.historyId).toBe("hist-1");
  });

  it("stopWatch deletes the watch row + calls gateway.stop", async () => {
    await prisma.emailWatch.create({
      data: {
        id: `${SCOPE}-stop`,
        userId: USER_ID,
        email: EMAIL,
        historyId: "h",
        expiration: new Date(2030, 0, 1),
      },
    });

    await service.stopWatch(EMAIL);

    expect(gateway.calls).toContain("stop");
    const watch = await prisma.emailWatch.findUnique({ where: { email: EMAIL } });
    expect(watch).toBeNull();
  });
});
