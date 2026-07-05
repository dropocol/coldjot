/**
 * Group I — contact-processor characterization tests.
 *
 * Pins the CURRENT behavior of services/jobs/contact/processor.ts →
 * `ContactProcessor.processNewContacts`.
 *
 * The processor finds SequenceContacts in NOT_STARTED + lastProcessedAt:null,
 * then for each calls `processContactShared({ sequence, contact, currentStep: 1,
 * startedAt })` with the JobManager. We mock processContactShared (it has its
 * own deep stack) and characterize the prisma-driven selection + per-contact
 * dispatch, including the "continue on error" loop behavior.
 *
 * Source: services/jobs/contact/processor.ts (lines 19–139).
 */
import { vi } from "vitest";
import { setupTestContext } from "@/__tests__/helpers/test-context";

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

// Break the service-manager ↔ base-processor cycle.
vi.mock("@/services/service-manager", () => ({
  ServiceManager: class {
    static getInstance() {
      return { getJobManager: () => ({ add: vi.fn() }) };
    }
  },
}));

const mocks = vi.hoisted(() => ({
  processContactShared: vi.fn<(...args: any[]) => Promise<void>>(async () => undefined),
}));
vi.mock("@/services/jobs/sequence/helper", () => ({
  processContactShared: (...args: any[]) => mocks.processContactShared(...args),
}));

const ctx = setupTestContext();

import { ContactProcessor } from "@/services/jobs/contact/processor";
import { SequenceContactStatusEnum } from "@coldjot/types";

beforeEach(() => {
  ctx.reset();
  mocks.processContactShared.mockClear();
  mocks.processContactShared.mockResolvedValue(undefined);
});

const SEQ_ID = "seq-1";
const CONTACT_ID = "ct-1";

/** Seed a NOT_STARTED SequenceContact with attached sequence + contact. */
function seedNewContact(scId: string, contactId: string, contactEmail = "ada@example.com") {
  // applyIncludes resolves `sequence` from the sequence store by sequenceId,
  // and `contact` is passed through (kept from the row spread). Seed both.
  ctx.fake.seed("sequence", { id: SEQ_ID, steps: [] });
  ctx.fake.seed("contact", { id: contactId, email: contactEmail });
  ctx.fake.seed(
    "sequenceContact",
    {
      id: scId,
      sequenceId: SEQ_ID,
      contactId,
      status: SequenceContactStatusEnum.NOT_STARTED,
      lastProcessedAt: null,
      contact: { id: contactId, email: contactEmail },
    }
  );
}

async function runContact() {
  const queue = new (await import("bullmq")).Queue("q" as any, {} as any);
  // Phase 6.3: JobManager is constructor-injected. Pass a stub; the processor
  // forwards it to processContactShared (mocked), which the test asserts on.
  const jobManager = { add: vi.fn() } as any;
  const p = new ContactProcessor(queue as any, jobManager);
  await (p as any).processNewContacts();
}

describe("[Group I] ContactProcessor.processNewContacts", () => {
  it("dispatches each new contact to processContactShared with currentStep=1", async () => {
    seedNewContact("sc-1", CONTACT_ID, "ada@example.com");

    await runContact();

    expect(mocks.processContactShared).toHaveBeenCalledTimes(1);
    const [payload, jobManager] = mocks.processContactShared.mock.calls[0];
    expect(payload).toMatchObject({
      currentStep: 1,
      contact: { id: CONTACT_ID, email: "ada@example.com" },
      sequence: { id: SEQ_ID },
    });
    expect(payload.startedAt).toBeInstanceOf(Date);
    expect(jobManager).toBeDefined();
  });

  it("continues to the next contact when processContactShared throws", async () => {
    seedNewContact("sc-1", "ct-1", "a@x.com");
    seedNewContact("sc-2", "ct-2", "b@x.com");
    mocks.processContactShared.mockRejectedValueOnce(new Error("boom"));

    await runContact();

    expect(mocks.processContactShared).toHaveBeenCalledTimes(2);
  });

  it("does nothing when no contacts are NOT_STARTED", async () => {
    await runContact();
    expect(mocks.processContactShared).not.toHaveBeenCalled();
  });
});
