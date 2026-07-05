/**
 * Unit tests for BaseProcessor.onFailed — the DLQ-copy path that Phase 0 never
 * asserted. Uses a minimal concrete subclass to exercise the protected hook.
 *
 * Also covers the contract documented in Phase 6.2: an empty DLQ map (the test
 * default) means no DLQ copy — the path is a no-op rather than a throw.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Queue, Job } from "bullmq";
import { BaseProcessor } from "@/services/jobs/base-processor";
import { QUEUE_NAMES } from "@/config";
import { JOB_RETRY } from "@/config/queue/policy";

/** Minimal concrete subclass exposing the protected onFailed hook. */
class TestProcessor extends BaseProcessor<any> {
  constructor(queue: Queue, dlQueues: Map<string, Queue> = new Map()) {
    super(queue, QUEUE_NAMES.EMAIL, { connection: {} } as any, dlQueues);
  }
  protected async process(): Promise<void> {}
  async callOnFailed(job: Job<any>, error: Error) {
    return this.onFailed(job, error);
  }
}

/** Build a stub Queue + worker name so `dlQueues.get(`${worker.name}-dl`)` resolves. */
function makeDlQueue(name: string, add: ReturnType<typeof vi.fn>): Queue {
  return { name, add } as unknown as Queue;
}

/** A DLQueue.add mock typed to accept BullMQ's (name, data, opts) triple. */
const dlAddFn = () => vi.fn<(name: string, data: any, opts: any) => Promise<any>>(async () => ({}));

function makeJob(over: Partial<Job<any>> = {}): Job<any> {
  return {
    id: "job-1",
    name: "email-sending",
    queueName: "email-sending",
    data: { sequenceId: "s1" },
    opts: { attempts: JOB_RETRY.attempts },
    attemptsMade: JOB_RETRY.attempts,
    ...over,
  } as unknown as Job<any>;
}

let queue: Queue;
beforeEach(() => {
  queue = { name: "email-sending", opts: { connection: {} } } as unknown as Queue;
});

describe("BaseProcessor.onFailed — DLQ copy", () => {
  it("copies the job to the paired DLQ when retries are exhausted", async () => {
    const dlAdd = dlAddFn();
    const dlQueues = new Map<string, Queue>([
      ["email-sending-dl", makeDlQueue("email-sending-dl", dlAdd)],
    ]);
    const p = new TestProcessor(queue, dlQueues);
    await p.callOnFailed(makeJob(), new Error("boom"));
    expect(dlAdd).toHaveBeenCalledTimes(1);
    const [name, data, opts] = dlAdd.mock.calls[0];
    expect(name).toBe("email-sending");
    expect(data).toEqual({ sequenceId: "s1" });
    expect(opts).toEqual({ jobId: "job-1" });
  });

  it("does NOT copy when retries remain (attemptsMade < attempts)", async () => {
    const dlAdd = dlAddFn();
    const dlQueues = new Map<string, Queue>([
      ["email-sending-dl", makeDlQueue("email-sending-dl", dlAdd)],
    ]);
    const p = new TestProcessor(queue, dlQueues);
    await p.callOnFailed(
      makeJob({ attemptsMade: JOB_RETRY.attempts - 1 }),
      new Error("transient")
    );
    expect(dlAdd).not.toHaveBeenCalled();
  });

  it("is a no-op (no throw) when the DLQ map is empty", async () => {
    const p = new TestProcessor(queue, new Map());
    await expect(
      p.callOnFailed(makeJob(), new Error("boom"))
    ).resolves.toBeUndefined();
  });

  it("swallows a DLQ add failure (logs, does not rethrow)", async () => {
    const dlAdd = vi.fn<(name: string, data: any, opts: any) => Promise<any>>(async () => {
      throw new Error("DLQ write failed");
    });
    const dlQueues = new Map<string, Queue>([
      ["email-sending-dl", makeDlQueue("email-sending-dl", dlAdd)],
    ]);
    const p = new TestProcessor(queue, dlQueues);
    // Must not reject — onFailed catches the DLQ error.
    await expect(p.callOnFailed(makeJob(), new Error("boom"))).resolves.toBeUndefined();
    expect(dlAdd).toHaveBeenCalledTimes(1);
  });
});
