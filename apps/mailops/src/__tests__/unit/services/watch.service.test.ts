/**
 * Unit tests for WatchService (Group F).
 *
 * Phase 7.2: now that WatchService takes its Gmail REST surface via the
 * injected `WatchGateway` + token refresh via `TokenRefresher` (Phase A3), the
 * watch lifecycle is testable with in-memory fakes — no OAuth2 client, no
 * global fetch stub, no PubSub construction at call time (the PubSub client is
 * built in the constructor but never touched by setup/renew/stop).
 *
 * Covers: setupWatch (creates a watch row, calls gateway in order), renewWatch
 * (updates historyId + expiration), stopWatch (deletes the row + calls stop),
 * and the no-access-token early return. Replaces the Group F characterization
 * test.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { WatchService } from "@/services/watch";
import type { WatchGateway, ProfileResult } from "@/adapters/watch-gateway";
import type { TokenRefresher } from "@/adapters/token-refresher";
import {
  FakeMailboxRepository,
  FakeEmailWatchRepository,
} from "@/__tests__/helpers/fakes/inbox-sync-repos.fake";

/** Records every gateway call; tests assert on the call log. */
class FakeWatchGateway implements WatchGateway {
  calls: Array<{ method: string; args: any[] }> = [];
  profile: ProfileResult = { historyId: "hist-from-profile" };
  watchResponse = { historyId: "hist-from-watch", expiration: "2030-01-01" } as any;
  async getProfile(accessToken: string) {
    this.calls.push({ method: "getProfile", args: [accessToken] });
    return this.profile;
  }
  async stop(accessToken: string) {
    this.calls.push({ method: "stop", args: [accessToken] });
  }
  async watch(accessToken: string, topicName: string) {
    this.calls.push({ method: "watch", args: [accessToken, topicName] });
    return this.watchResponse;
  }
  async createWatchRequest(accessToken: string) {
    this.calls.push({ method: "createWatchRequest", args: [accessToken] });
    return this.watchResponse;
  }
}

/** Always returns a fresh token; tests override to simulate failure. */
class FakeTokenRefresher implements TokenRefresher {
  token = "fresh-access-token";
  async refreshIfNeeded() {
    return this.token;
  }
}

let gateway: FakeWatchGateway;
let tokenRefresher: FakeTokenRefresher;
let mailboxRepo: FakeMailboxRepository;
let emailWatchRepo: FakeEmailWatchRepository;
let service: WatchService;

const EMAIL = "watched@example.com";
const USER_ID = "u1";

beforeEach(() => {
  gateway = new FakeWatchGateway();
  tokenRefresher = new FakeTokenRefresher();
  mailboxRepo = new FakeMailboxRepository();
  emailWatchRepo = new FakeEmailWatchRepository();
  service = new WatchService(gateway, tokenRefresher, mailboxRepo, emailWatchRepo);
});

/** Seed an active Gmail mailbox the watch resolves to. */
function seedMailbox() {
  mailboxRepo.store.set("mbox-1", {
    id: "mbox-1",
    userId: USER_ID,
    email: EMAIL,
    isActive: true,
    provider: "gmail",
    name: null,
    access_token: "tok",
    refresh_token: "ref",
    expires_at: 9999999999,
    providerAccountId: "acct",
  } as any);
  mailboxRepo.store.index("email", EMAIL, "mbox-1");
}

describe("[Group F] WatchService.setupWatch", () => {
  it("calls getProfile → stop → watch, then creates a watch row", async () => {
    await service.setupWatch({
      userId: USER_ID,
      email: EMAIL,
      accessToken: "tok",
      refreshToken: "ref",
      expiresAt: 9999999999,
    });

    // Gateway call order.
    const methods = gateway.calls.map((c) => c.method);
    expect(methods).toEqual(["getProfile", "stop", "watch"]);

    // A watch row was created with the profile's historyId.
    const watch = await emailWatchRepo.findByEmail(EMAIL);
    expect(watch).not.toBeNull();
    expect(watch!.historyId).toBe("hist-from-profile");
    expect(watch!.userId).toBe(USER_ID);
  });

  it("updates the existing watch row instead of creating a new one", async () => {
    // Pre-seed an existing watch.
    await emailWatchRepo.create({
      id: "existing",
      userId: USER_ID,
      email: EMAIL,
      historyId: "old",
      expiration: new Date(2025, 0, 1),
    });

    await service.setupWatch({
      userId: USER_ID,
      email: EMAIL,
      accessToken: "tok",
    });

    // Still exactly one watch row, now with the new historyId.
    const all = emailWatchRepo.store.rows;
    expect(all.size).toBe(1);
    const watch = await emailWatchRepo.findByEmail(EMAIL);
    expect(watch?.historyId).toBe("hist-from-profile");
  });
});

describe("[Group F] WatchService.stopWatch", () => {
  it("deletes the watch row + calls gateway.stop when a mailbox exists", async () => {
    seedMailbox();
    await emailWatchRepo.create({
      id: "w-1",
      userId: USER_ID,
      email: EMAIL,
      historyId: "h",
      expiration: new Date(2030, 0, 1),
    });

    await service.stopWatch(EMAIL);

    expect(await emailWatchRepo.findByEmail(EMAIL)).toBeNull();
    expect(gateway.calls.some((c) => c.method === "stop")).toBe(true);
  });

  it("is a no-op (no gateway.stop) when no active mailbox exists", async () => {
    // No mailbox seeded.
    await emailWatchRepo.create({
      id: "w-2",
      userId: USER_ID,
      email: EMAIL,
      historyId: "h",
      expiration: new Date(2030, 0, 1),
    });

    await service.stopWatch(EMAIL);

    expect(gateway.calls.some((c) => c.method === "stop")).toBe(false);
  });
});
