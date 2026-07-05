/**
 * Group O — watch-cleanup characterization tests.
 *
 * Pins the CURRENT behavior of services/watch/cleanup.ts →
 * `WatchCleanupService.cleanup()`.
 *
 * cleanup():
 *   1. computes a renewal buffer (now + buffer),
 *   2. finds EmailWatches whose expiration ≤ buffer,
 *   3. for each: calls watchService.renewWatch(id); on failure calls
 *      watchService.stopWatch(email),
 *   4. deletes EmailWatchHistory rows older than 30 days that are processed.
 *
 * WatchService is mocked; the prisma-driven selection + history purge is what
 * we pin. Swallows all errors (never throws).
 *
 * Source: services/watch/cleanup.ts (lines 68–179).
 */
import { vi } from "vitest";
import { setupTestContext } from "@/__tests__/helpers/test-context";

const mocks = vi.hoisted(() => ({
  renewWatch: vi.fn<(id: string) => Promise<void>>(async () => undefined),
  stopWatch: vi.fn<(email: string) => Promise<void>>(async () => undefined),
}));

vi.mock("@/services/watch/index", () => ({
  WatchService: class {
    renewWatch = mocks.renewWatch;
    stopWatch = mocks.stopWatch;
  },
}));

const ctx = setupTestContext();

import { WatchCleanupService } from "@/services/watch/cleanup";

beforeEach(() => {
  ctx.reset();
  mocks.renewWatch.mockClear();
  mocks.renewWatch.mockResolvedValue(undefined);
  mocks.stopWatch.mockClear();
});

/** Seed an EmailWatch with a given expiration. */
function seedWatch(id: string, email: string, expiration: Date) {
  ctx.fake.seed("emailWatch", { id, email, expiration });
}

describe("[Group O] WatchCleanupService.cleanup", () => {
  it("renews watches whose expiration is within the renewal buffer", async () => {
    // Expiration in the past → always ≤ buffer → selected for renewal.
    seedWatch("w1", "a@x.com", new Date("2020-01-01T00:00:00.000Z"));
    seedWatch("w2", "b@x.com", new Date("2020-01-02T00:00:00.000Z"));

    const svc = new WatchCleanupService();
    await svc.cleanup();

    expect(mocks.renewWatch).toHaveBeenCalledWith("w1");
    expect(mocks.renewWatch).toHaveBeenCalledWith("w2");
    expect(mocks.renewWatch).toHaveBeenCalledTimes(2);
    expect(mocks.stopWatch).not.toHaveBeenCalled();
  });

  it("calls stopWatch(email) when renewWatch throws", async () => {
    seedWatch("w-bad", "bad@x.com", new Date("2020-01-01T00:00:00.000Z"));
    mocks.renewWatch.mockRejectedValue(new Error("renew failed"));

    const svc = new WatchCleanupService();
    await svc.cleanup();

    expect(mocks.renewWatch).toHaveBeenCalledWith("w-bad");
    expect(mocks.stopWatch).toHaveBeenCalledWith("bad@x.com");
  });

  it("deletes processed EmailWatchHistory rows older than 30 days", async () => {
    const old = new Date();
    old.setDate(old.getDate() - 31);
    ctx.fake.seed("emailWatchHistory", {
      id: "h1",
      createdAt: old,
      processed: true,
    });
    ctx.fake.seed("emailWatchHistory", {
      id: "h2",
      createdAt: old,
      processed: false, // not processed → kept
    });

    const svc = new WatchCleanupService();
    await svc.cleanup();

    // deleteMany records the call; the rows matching the where are deleted.
    const deleteCall = ctx.fake.calls.find(
      (c) => c.model === "emailWatchHistory" && c.op === "deleteMany"
    );
    expect(deleteCall).toBeDefined();
    expect(deleteCall!.args.where).toMatchObject({
      processed: true,
      createdAt: { lt: expect.any(Date) },
    });
    // h1 (old + processed) deleted; h2 (not processed) kept.
    expect(ctx.fake.stores.emailWatchHistory.rows.has("h1")).toBe(false);
    expect(ctx.fake.stores.emailWatchHistory.rows.has("h2")).toBe(true);
  });

  it("never throws — outer catch swallows errors", async () => {
    // No seeds; nothing throws here, but pin the no-throw contract.
    const svc = new WatchCleanupService();
    await expect(svc.cleanup()).resolves.toBeUndefined();
  });
});
