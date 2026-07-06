/**
 * Unit tests for ContactProcessor.processNewContacts (Group I).
 *
 * Phase 7.9: the processor now constructor-injects its repo (Phase A refactor),
 * so the orchestration is testable with a fake repo + a mocked
 * `processContactShared` helper + a mocked `bullmq`. Covers: dispatching each
 * new contact with currentStep=1, continue-on-error, and the empty-batch no-op.
 *
 * Replaces the Group I characterization test (contact-processor). The DB layer
 * (findNewContacts) is covered by repositories/prisma-sequence-contact.repo.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

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

const sharedMock = vi.hoisted(() => ({ processContactShared: vi.fn(async () => ({})) }));
vi.mock("@/services/jobs/sequence/helper", () => ({
  processContactShared: sharedMock.processContactShared,
}));

import { ContactProcessor } from "@/services/jobs/contact/processor";

function makeContact(id: string) {
  return {
    id,
    sequenceId: "seq-1",
    contactId: `c-${id}`,
    sequence: { id: "seq-1", sequenceMailbox: { id: "sm-1" }, steps: [{ id: "s1", order: 1 }], businessHours: null },
    contact: { id: `c-${id}`, email: `${id}@x.com` },
  };
}

let processor: ContactProcessor;
let newContacts: any[];

beforeEach(() => {
  vi.clearAllMocks();
  newContacts = [];
});

function makeProcessor() {
  const queue = new (require("bullmq").Queue)("contact-test");
  const jobManager = { add: vi.fn(async () => ({ id: "j-1" })) };
  const fakeRepo = {
    findNewContacts: vi.fn(async () => newContacts.slice()),
  };
  processor = new ContactProcessor(queue as any, jobManager as any, new Map(), fakeRepo as any);
}

describe("[Group I] ContactProcessor.processNewContacts", () => {
  it("dispatches each new contact to processContactShared with currentStep=1 + startedAt", async () => {
    newContacts.push(makeContact("1"));
    makeProcessor();
    await (processor as any).processNewContacts();

    expect(sharedMock.processContactShared).toHaveBeenCalledTimes(1);
    const call = sharedMock.processContactShared.mock.calls[0] as any[];
    const arg = call[0];
    expect(arg.currentStep).toBe(1);
    expect(arg.startedAt).toBeInstanceOf(Date);
    expect(arg.contact.email).toBe("1@x.com");
  });

  it("continues to the next contact when processContactShared throws", async () => {
    newContacts.push(makeContact("1"), makeContact("2"));
    sharedMock.processContactShared
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({});
    makeProcessor();
    await (processor as any).processNewContacts();

    // Both were attempted (continue-on-error).
    expect(sharedMock.processContactShared).toHaveBeenCalledTimes(2);
  });

  it("does nothing when no contacts are NOT_STARTED", async () => {
    makeProcessor();
    await (processor as any).processNewContacts();

    expect(sharedMock.processContactShared).not.toHaveBeenCalled();
  });
});
