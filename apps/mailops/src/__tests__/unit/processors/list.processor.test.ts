/**
 * Unit tests for ListSyncProcessor.processSyncRecords (Group H).
 *
 * Phase 7.9: the processor now constructor-injects its repo (Phase A refactor),
 * so the orchestration is testable with a fake repo + a mocked `syncListToSequences`
 * helper + a mocked `bullmq` (the scheduler runs in the constructor). Covers the
 * state-machine transitions (processing → completed / failed), the sort-by-
 * contact-count, the empty-batch early return, and the failure path.
 *
 * Replaces the Group H characterization test (list-sync). The DB layer is
 * covered by repositories/prisma-list-sync-record.repo.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock bullmq: BaseProcessor extends/imports Worker + Queue + Job; the
// processor's constructor calls queue.upsertJobScheduler. Provide the full
// surface the import graph needs.
vi.mock("bullmq", () => ({
  Queue: class {
    upsertJobScheduler = vi.fn(async () => ({}));
    close = vi.fn(async () => undefined);
    constructor(_name: string) {}
  },
  Worker: class {
    constructor() {}
    on() {}
    close = vi.fn(async () => undefined);
  },
  Job: class {},
}));

// Mock the sync helper (it has its own deep stack).
const syncMock = vi.hoisted(() => ({ syncListToSequences: vi.fn(async () => ({})) }));
vi.mock("@/services/jobs/list/helper", () => ({
  syncListToSequences: syncMock.syncListToSequences,
}));

import { ListSyncProcessor } from "@/services/jobs/list/processor";

/** Minimal fake repo: records updateStatus calls + returns a seeded pending set. */
function makeFakeRepo(pending: any[] = []) {
  const updates: Array<{ id: string; data: any }> = [];
  return {
    pending,
    updates,
    async findPending() {
      return pending.slice();
    },
    async updateStatus(id: string, data: any) {
      updates.push({ id, data });
    },
  };
}

function makeRecord(id: string, listId: string, contacts: number) {
  return {
    id,
    listId,
    sequenceId: "seq-1",
    status: "pending",
    contactsAdded: 0,
    error: null,
    createdAt: new Date(),
    list: { _count: { contacts } },
  };
}

let processor: ListSyncProcessor;
let fakeRepo: any;

beforeEach(() => {
  vi.clearAllMocks();
});

async function makeProcessor(pending: any[] = []) {
  fakeRepo = makeFakeRepo(pending);
  const queue = new (require("bullmq").Queue)("list-sync-test");
  processor = new ListSyncProcessor(queue as any, new Map(), fakeRepo as any);
  // processSyncRecords is private; invoke it directly.
  await (processor as any).processSyncRecords();
}

describe("[Group H] ListSyncProcessor.processSyncRecords", () => {
  it("marks a pending record processing → syncs → marks completed", async () => {
    await makeProcessor([makeRecord("r1", "list-1", 5)]);

    expect(syncMock.syncListToSequences).toHaveBeenCalledWith("list-1");
    const statuses = fakeRepo.updates.map((u: any) => u.data.status);
    expect(statuses).toContain("processing");
    expect(statuses).toContain("completed");
  });

  it("marks the record 'failed' with the error message when sync throws", async () => {
    syncMock.syncListToSequences.mockRejectedValueOnce(new Error("sync blew up"));
    await makeProcessor([makeRecord("r2", "list-2", 3)]);

    const failed = fakeRepo.updates.find((u: any) => u.data.status === "failed");
    expect(failed).toBeTruthy();
    expect(failed.data.error).toBe("sync blew up");
  });

  it("processes multiple records (sorted by contact count ascending)", async () => {
    const big = makeRecord("big", "list-big", 100);
    const small = makeRecord("small", "list-small", 2);
    await makeProcessor([big, small]);

    // Both synced.
    expect(syncMock.syncListToSequences).toHaveBeenCalledTimes(2);
    // The small list was synced first (sorted ascending by contact count).
    const firstCall = syncMock.syncListToSequences.mock.calls[0] as any[];
    expect(firstCall[0]).toBe("list-small");
  });

  it("returns early with no sync calls when no pending records", async () => {
    await makeProcessor([]);
    expect(syncMock.syncListToSequences).not.toHaveBeenCalled();
  });
});
