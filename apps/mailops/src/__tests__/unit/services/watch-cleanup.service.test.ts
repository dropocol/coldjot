/**
 * Unit tests for WatchCleanupService.cleanup (Group O).
 *
 * Phase 7.9: `WatchCleanupService` constructs its own `WatchService` + two Prisma
 * repos internally, so we mock the three modules (`@/services/watch/index` +
 * the two repo impls) and assert the cleanup orchestration: due-watch renewal,
 * the renew-fail → stopWatch fallback, the 30-day history purge, and the
 * never-throws contract.
 *
 * Replaces the Group O characterization test (watch-cleanup). The collaborator
 * repos are also covered directly by the 7.5 repo tests (findDueForRenewal,
 * purgeProcessedBefore); this file covers the orchestration that wires them.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => {
  // WatchService methods called by cleanup.
  const renewWatch = vi.fn(async () => undefined);
  const stopWatch = vi.fn(async () => undefined);
  // EmailWatchRepository state.
  const dueWatches: any[] = [];
  const findDueForRenewal = vi.fn(async () => dueWatches.slice());
  // EmailWatchHistoryRepository state.
  let purgedWith: Date | null = null;
  const purgeProcessedBefore = vi.fn(async (cutoff: Date) => {
    purgedWith = cutoff;
    return { count: 0 };
  });
  return {
    renewWatch,
    stopWatch,
    dueWatches,
    findDueForRenewal,
    purgeProcessedBefore,
    getPurgedCutoff: () => purgedWith,
    reset: () => {
      dueWatches.length = 0;
      purgedWith = null;
    },
  };
});

vi.mock("@/services/watch/index", () => ({
  WatchService: class {
    renewWatch = mocks.renewWatch;
    stopWatch = mocks.stopWatch;
  },
}));

vi.mock("@/repositories/prisma/prisma-email-watch.repo", () => ({
  PrismaEmailWatchRepository: class {
    findDueForRenewal = mocks.findDueForRenewal;
  },
}));

vi.mock("@/repositories/prisma/prisma-email-watch-history.repo", () => ({
  PrismaEmailWatchHistoryRepository: class {
    purgeProcessedBefore = mocks.purgeProcessedBefore;
  },
}));

import { WatchCleanupService } from "@/services/watch/cleanup";

beforeEach(() => {
  mocks.renewWatch.mockClear();
  mocks.renewWatch.mockResolvedValue(undefined);
  mocks.stopWatch.mockClear();
  mocks.findDueForRenewal.mockClear();
  mocks.purgeProcessedBefore.mockClear();
  mocks.reset();
});

describe("[Group O] WatchCleanupService.cleanup", () => {
  it("renews every due watch + purges processed history older than 30 days", async () => {
    mocks.dueWatches.push(
      { id: "w1", email: "a@x.com", expiration: new Date("2020-01-01") },
      { id: "w2", email: "b@x.com", expiration: new Date("2020-01-02") }
    );

    const svc = new WatchCleanupService();
    await svc.cleanup();

    expect(mocks.renewWatch).toHaveBeenCalledWith("w1");
    expect(mocks.renewWatch).toHaveBeenCalledWith("w2");
    expect(mocks.renewWatch).toHaveBeenCalledTimes(2);
    expect(mocks.stopWatch).not.toHaveBeenCalled();

    // History purge invoked with a ~30-days-ago cutoff.
    expect(mocks.purgeProcessedBefore).toHaveBeenCalledTimes(1);
    const cutoff = mocks.getPurgedCutoff();
    expect(cutoff).toBeInstanceOf(Date);
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(Date.now() - cutoff!.getTime() - thirtyDaysMs)).toBeLessThan(5000);
  });

  it("calls stopWatch(email) when renewWatch throws for that watch", async () => {
    mocks.dueWatches.push({ id: "w-bad", email: "bad@x.com", expiration: new Date("2020-01-01") });
    mocks.renewWatch.mockRejectedValue(new Error("renew failed"));

    const svc = new WatchCleanupService();
    await svc.cleanup(); // must not throw

    expect(mocks.renewWatch).toHaveBeenCalledWith("w-bad");
    expect(mocks.stopWatch).toHaveBeenCalledWith("bad@x.com");
  });

  it("never throws even when findDueForRenewal rejects", async () => {
    mocks.findDueForRenewal.mockRejectedValueOnce(new Error("db down"));
    const svc = new WatchCleanupService();
    await expect(svc.cleanup()).resolves.toBeUndefined();
  });
});
