/**
 * Integration test — Gmail OAuth token refresh mid-flow.
 *
 * Phase 7.7 flow 12 (Group J): the token-refresh path. `WatchService.getAccessToken`
 * (private) calls the injected `TokenRefresher` when the mailbox token is
 * expired; the renewed token is then handed to the gateway. This test wires the
 * real WatchService against real repos + a fake gateway + a fake token refresher
 * that simulates expiry-then-refresh, asserting the renewed token reaches the
 * gateway.
 *
 * Replaces the Group J characterization test's token-refresh coverage.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@coldjot/database";
import { WatchService } from "@/services/watch";
import type { WatchGateway, ProfileResult } from "@/adapters/watch-gateway";
import type { TokenRefresher } from "@/adapters/token-refresher";
import { PrismaMailboxRepository } from "@/repositories/prisma/prisma-mailbox.repo";
import { PrismaEmailWatchRepository } from "@/repositories/prisma/prisma-email-watch.repo";
import { seedUser, seedMailbox } from "../helpers/seed";

const SCOPE = "it-token";
let USER_ID: string;
const EMAIL = `${SCOPE}@example.com`;

/** Records the access tokens it receives per gateway call. */
class TokenCapturingGateway implements WatchGateway {
  tokensSeen: string[] = [];
  async getProfile(accessToken: string): Promise<ProfileResult> {
    this.tokensSeen.push(accessToken);
    return { historyId: "h" };
  }
  async stop(accessToken: string) {
    this.tokensSeen.push(accessToken);
  }
  async watch(accessToken: string) {
    this.tokensSeen.push(accessToken);
    return { historyId: "h", expiration: "2030-01-01" } as any;
  }
  async createWatchRequest(accessToken: string) {
    this.tokensSeen.push(accessToken);
    return { historyId: "h", expiration: "2030-01-01" } as any;
  }
}

/** Simulates token refresh: always returns a fresh "renewed-token". */
class ExpiringTokenRefresher implements TokenRefresher {
  calls = 0;
  async refreshIfNeeded() {
    this.calls++;
    return "renewed-token";
  }
}

const gateway = new TokenCapturingGateway();
const tokenRefresher = new ExpiringTokenRefresher();
const service = new WatchService(
  gateway,
  tokenRefresher,
  new PrismaMailboxRepository(),
  new PrismaEmailWatchRepository()
);

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  USER_ID = `${SCOPE}-user`;
  await seedUser(USER_ID);
});

beforeEach(async () => {
  gateway.tokensSeen = [];
  tokenRefresher.calls = 0;
  await prisma.emailWatch.deleteMany({ where: { email: EMAIL } });
  await prisma.mailbox.deleteMany({ where: { email: EMAIL } });
  // Seed a mailbox whose stored access_token is the "expired" one; the token
  // refresher will hand back "renewed-token" regardless.
  await seedMailbox(`${SCOPE}-mbox`, USER_ID, EMAIL, {
    access_token: "expired-token",
    refresh_token: "ref",
    expires_at: 1, // long expired
  });
});

describe("token refresh (WatchService vs real DB)", () => {
  it("renewWatch refreshes the expired access token before calling the gateway", async () => {
    // Seed a watch row to renew — renewWatch calls getAccessToken (which refreshes).
    const watch = await prisma.emailWatch.create({
      data: {
        id: `${SCOPE}-watch-1`,
        userId: USER_ID,
        email: EMAIL,
        historyId: "old",
        expiration: new Date(2025, 0, 1),
      },
    });

    await service.renewWatch(watch.id);

    // The token refresher was consulted at least once.
    expect(tokenRefresher.calls).toBeGreaterThanOrEqual(1);
    // The gateway saw the RENEWED token (not the expired one).
    expect(gateway.tokensSeen).toContain("renewed-token");
    expect(gateway.tokensSeen).not.toContain("expired-token");
  });

  it("stopWatch also routes through the refreshed token", async () => {
    const watch = await prisma.emailWatch.create({
      data: {
        id: `${SCOPE}-watch-2`,
        userId: USER_ID,
        email: EMAIL,
        historyId: "old",
        expiration: new Date(2025, 0, 1),
      },
    });

    await service.stopWatch(EMAIL);

    expect(tokenRefresher.calls).toBeGreaterThanOrEqual(1);
    expect(gateway.tokensSeen).toContain("renewed-token");
  });
});
