/**
 * Unit tests for EmailProcessor soft-delete handling (sub-plan 06).
 *
 * The email processor fetches the contact via `db.contact.findActiveById` at
 * send time. If the contact was soft-deleted (or hard-purged) in the window
 * between scheduling and send, `findActiveById` returns null and the send
 * must be SKIPPED (no email queued, no retry-storm), with a warn log so the
 * skip is debuggable.
 *
 * The DB layer is mocked here; only the orchestration is exercised. Mirrors
 * the contact.processor.test.ts harness (mocked bullmq + @coldjot/database).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// --- Mock bullmq (BaseProcessor constructs a Worker at construction time) ---
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

// --- Mock @coldjot/database (the prisma domain extension) ----------------
// Hoist so the factory can reference the fakes. `findActiveById` is the seam
// under test — returning null simulates a soft-deleted contact.
const dbMock = vi.hoisted(() => ({
  contact: {
    findActiveById: vi.fn<(id: string) => Promise<any>>(async () => null),
  },
  emailTracking: {
    findSentByJobId: vi.fn<(jobId: string) => Promise<any>>(async () => null),
  },
  emailEvent: {
    existsBySequenceContactInTypes: vi.fn(async () => false),
  },
  template: {
    findById: vi.fn(async () => null),
  },
  sequenceStep: {
    findWithSequenceMeta: vi.fn(async () => ({
      id: "step-1",
      templateId: null,
      subject: "Hi",
      content: "Hello {{firstName}}",
      order: 1,
      replyToThread: false,
      stepType: "EMAIL",
      timing: { type: "IMMEDIATE" },
    })),
  },
}));
vi.mock("@coldjot/database", () => ({ prisma: dbMock }));

// --- Mock the external service seams the processor calls ------------------
const sendMock = vi.hoisted(() => ({ send: vi.fn(async () => ({ success: true })) }));
vi.mock("@/services/domain/send-email.service", () => ({
  sendEmailService: { send: sendMock.send },
}));

const trackingMock = vi.hoisted(() => ({ createTracking: vi.fn(async () => ({ id: "t-1" })) }));
vi.mock("@/services/domain/tracking.service", () => ({
  trackingService: { createTracking: trackingMock.createTracking },
}));

const rateLimitMock = vi.hoisted(() => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  incrementCounters: vi.fn(async () => undefined),
}));
vi.mock("@/services/core/rate-limit/service", () => ({
  rateLimitService: rateLimitMock,
}));

// Helper modules that touch mailbox/gmail — stub so no real client is built.
// (Never reached in the skip case, but imported at module load time.)
vi.mock("@/lib/mailbox", () => ({
  getSequenceMailboxWithID: vi.fn(async () => null),
}));
vi.mock("@/lib/google", () => ({
  gmailClientService: { getClient: vi.fn(async () => undefined) },
}));

import { EmailProcessor } from "@/services/jobs/email/processor";

const CONTACT_ID = "soft-deleted-contact";
const SEQ_ID = "seq-1";
const STEP_ID = "step-1";
const JOB_ID = "job-1";

function makeJobData(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-1",
    sequenceId: SEQ_ID,
    contactId: CONTACT_ID,
    stepId: STEP_ID,
    sequenceMailboxId: "sm-1",
    to: "someone@example.com",
    testMode: false,
    disableSending: false,
    threadId: "",
    ...overrides,
  } as any;
}

let processor: EmailProcessor;

function makeProcessor() {
  const queue = new (require("bullmq").Queue)("email-test");
  processor = new EmailProcessor(queue as any, new Map());
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: contact is soft-deleted → findActiveById returns null.
  dbMock.contact.findActiveById.mockImplementation(async () => null);
  // Pass the pre-contact gates so we actually reach the contact lookup.
  dbMock.emailTracking.findSentByJobId.mockImplementation(async () => null);
  dbMock.emailEvent.existsBySequenceContactInTypes.mockImplementation(async () => false);
  rateLimitMock.checkRateLimit.mockImplementation(async () => ({ allowed: true }));
  makeProcessor();
});

describe("[sub-plan 06] EmailProcessor skips soft-deleted contacts", () => {
  it("skips the send (no email/tracking/rate-limit) when the contact is soft-deleted", async () => {
    // findActiveById → null simulates a soft-deleted (or hard-purged) contact.
    const job = { data: makeJobData(), id: JOB_ID } as any;
    await (processor as any).process(job);

    // The contact WAS looked up via the act-on seam, not the unfiltered
    // findById. (findById isn't even on dbMock.contact, so it could not have
    // been called — proving the wiring switched.)
    expect(dbMock.contact.findActiveById).toHaveBeenCalledWith(CONTACT_ID);

    // No downstream "act" side-effects fired — the send was skipped cleanly.
    expect(sendMock.send).not.toHaveBeenCalled();
    expect(trackingMock.createTracking).not.toHaveBeenCalled();
    expect(rateLimitMock.incrementCounters).not.toHaveBeenCalled();
  });

  it("does not throw / fail the job when the contact is soft-deleted", async () => {
    // A thrown error would make BullMQ retry the job — pointless for a
    // deleted contact. The skip must be a clean success return.
    const job = { data: makeJobData(), id: JOB_ID + "-2" } as any;
    await expect((processor as any).process(job)).resolves.toBeUndefined();
  });
});
