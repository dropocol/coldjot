/**
 * Group H — list-sync processor characterization tests.
 *
 * Pins the CURRENT behavior of services/jobs/list/processor.ts →
 * `ListSyncProcessor.processSyncRecords`.
 *
 * The processor:
 *   1. finds pending ListSyncRecords (ordered by createdAt, take 10, includes
 *      list._count.contacts),
 *   2. sorts them ascending by contact count (smaller lists first),
 *   3. for each: marks "processing" → calls syncListToSequences(listId) →
 *      marks "completed" (or "failed" + error on throw).
 *
 * We mock bullmq + the syncListToSequences helper; the prisma-driven state
 * machine is what we pin.
 *
 * Source: services/jobs/list/processor.ts (lines 14–135).
 */
import { vi } from "vitest";
import { setupTestContext, wasCalledWith } from "@/__tests__/helpers/test-context";

vi.mock("bullmq", () => ({
  Queue: class {
    opts = { connection: {} };
    async upsertJobScheduler() {}
    async add() {}
    async close() {}
  },
  Worker: class {
    on() {}
    close() {}
  },
  Job: class {},
}));

const mocks = vi.hoisted(() => ({
  syncListToSequences: vi.fn<(listId: string) => Promise<void>>(async () => undefined),
}));
vi.mock("@/services/jobs/list/helper", () => ({
  syncListToSequences: (...args: any[]) => mocks.syncListToSequences(...(args as [string])),
}));

const ctx = setupTestContext();

import { ListSyncProcessor } from "@/services/jobs/list/processor";

beforeEach(() => {
  ctx.reset();
  mocks.syncListToSequences.mockClear();
  mocks.syncListToSequences.mockResolvedValue(undefined);
});

/** Seed a pending ListSyncRecord whose attached list has `contactCount`. */
function seedSyncRecord(id: string, listId: string, contactCount: number) {
  ctx.fake.seed("listSyncRecord", {
    id,
    listId,
    status: "pending",
    createdAt: new Date(0),
    // attach the `include` shape directly — applyIncludes passes `list` through.
    list: { _count: { contacts: contactCount } },
  });
}

async function runSync() {
  const queue = new (await import("bullmq")).Queue("q" as any, {} as any);
  const p = new ListSyncProcessor(queue as any);
  await (p as any).processSyncRecords();
}

describe("[Group H] ListSyncProcessor.processSyncRecords", () => {
  it("marks a pending record processing → syncs → marks completed", async () => {
    seedSyncRecord("r1", "list-1", 5);

    await runSync();

    expect(mocks.syncListToSequences).toHaveBeenCalledWith("list-1");
    const r1 = ctx.fake.stores.listSyncRecord.rows.get("r1")!;
    expect(r1.status).toBe("completed");
    // Both transitions recorded.
    expect(
      wasCalledWith(ctx, "listSyncRecord", "update", {
        where: { id: "r1" },
        data: { status: "processing" },
      })
    ).toBe(true);
    expect(
      wasCalledWith(ctx, "listSyncRecord", "update", {
        where: { id: "r1" },
        data: { status: "completed" },
      })
    ).toBe(true);
  });

  it("marks the record 'failed' with the error message when syncListToSequences throws", async () => {
    seedSyncRecord("r2", "list-2", 1);
    mocks.syncListToSequences.mockRejectedValue(new Error("sync blew up"));

    await runSync();

    const r2 = ctx.fake.stores.listSyncRecord.rows.get("r2")!;
    expect(r2.status).toBe("failed");
    expect(r2.error).toBe("sync blew up");
  });

  it("processes records but the empty-batch path returns early with no sync calls", async () => {
    await runSync();
    expect(mocks.syncListToSequences).not.toHaveBeenCalled();
  });
});
