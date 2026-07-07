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
    // determineEmailSubject re-fetches the subject via this separate method
    // (email-subject.ts:70); default null so the subject falls back to step.
    findSubject: vi.fn(async () => null),
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
    // Used by handleSuccessfulEmail on the success path; stubbed here so a
    // successful send can complete its bookkeeping (not the test focus, but
    // required for the send path to resolve without throwing).
    countInSequence: vi.fn(async () => 1),
    listBySequence: vi.fn(async () => []),
  },
  sequence: {
    findWithBusinessHours: vi.fn(async () => ({
      id: SEQ_ID,
      businessHours: null,
    })),
  },
  emailThread: {
    record: vi.fn(async () => ({})),
  },
  sequenceContact: {
    // Used by updateSequenceContactThreadId/Status on the success path.
    updateBySequenceAndContact: vi.fn(async () => ({})),
  },
}));
vi.mock("@coldjot/database", () => ({ prisma: dbMock }));

// --- Mock the external service seams the processor calls ------------------
const sendMock = vi.hoisted(() => ({
  send: vi.fn(async () => ({ success: true, messageId: "msg-1", threadId: "thr-1" })),
}));
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
// `getSequenceMailboxWithId` is the exact export name the processor imports
// (lowercase d). Default returns a usable mailbox so the send path can proceed
// past the mailbox gate; per-test overrides change it when needed.
const mailboxMock = vi.hoisted(() => ({
  getSequenceMailboxWithId: vi.fn(async () => ({
    id: "mb-1",
    email: "sender@example.com",
    name: "Sender",
    accessToken: "at",
    refreshToken: "rt",
    expiryDate: 0,
  })),
}));
vi.mock("@/lib/mailbox", () => ({
  getSequenceMailboxWithId: mailboxMock.getSequenceMailboxWithId,
  // Back-compat alias (older tests referenced the capital-D spelling).
  getSequenceMailboxWithID: mailboxMock.getSequenceMailboxWithId,
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

/** A live, resolvable contact (the opposite of the soft-deleted default). */
function activeContact() {
  return {
    id: CONTACT_ID,
    firstName: "Jane",
    lastName: "Doe",
    name: "Jane Doe",
    email: "someone@example.com",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: contact is soft-deleted → findActiveById returns null.
  dbMock.contact.findActiveById.mockImplementation(async () => null);
  // Pass the pre-contact gates so we actually reach the contact lookup.
  dbMock.emailTracking.findSentByJobId.mockImplementation(async () => null);
  dbMock.emailEvent.existsBySequenceContactInTypes.mockImplementation(async () => false);
  rateLimitMock.checkRateLimit.mockImplementation(async () => ({ allowed: true }));
  // Default: no template resolves (templateId null path).
  dbMock.template.findById.mockImplementation(async () => null);
  // Default: usable mailbox so the send path can pass the mailbox gate.
  mailboxMock.getSequenceMailboxWithId.mockImplementation(async () => ({
    id: "mb-1",
    email: "sender@example.com",
    name: "Sender",
    accessToken: "at",
    refreshToken: "rt",
    expiryDate: 0,
  }));
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

describe("[sub-plan 06] EmailProcessor abort-on-empty safety net", () => {
  it("skips the send (no Gmail call, no tracking write) when subject and content resolve to empty", async () => {
    // Active contact — we must get PAST the contact skip to exercise the net.
    dbMock.contact.findActiveById.mockImplementation(async () => activeContact());
    // Step has no template (templateId null) and no own subject/content — the
    // exact shape a SET-NULL + null-body step produces. findById on "" → null.
    dbMock.sequenceStep.findWithSequenceMeta.mockImplementation(async () => ({
      id: STEP_ID,
      templateId: null,
      subject: null,
      content: null,
      order: 1,
      replyToThread: false,
      stepType: "EMAIL",
      timing: { type: "IMMEDIATE" },
    }) as any);
    dbMock.template.findById.mockImplementation(async () => null);

    const job = { data: makeJobData(), id: JOB_ID + "-empty" } as any;
    await (processor as any).process(job);

    // The net fired: clean success return, NO Gmail send, NO tracking row.
    expect(sendMock.send).not.toHaveBeenCalled();
    expect(trackingMock.createTracking).not.toHaveBeenCalled();
  });

  it("still sends when the referenced template is soft-deleted (trash state does not gate sends)", async () => {
    // This is the load-bearing regression test for design decision B (README):
    // a trashed template MUST still resolve at send time. If a future change
    // added a `deletedAt: null` filter to `template.findById`, this fails.
    dbMock.contact.findActiveById.mockImplementation(async () => activeContact());
    // Linked step: has a templateId, step's own subject/content are null
    // (linking nulls them — README §"two step states"). The send path's only
    // source of content is the template row.
    dbMock.sequenceStep.findWithSequenceMeta.mockImplementation(async () => ({
      id: STEP_ID,
      templateId: "tpl_1",
      subject: null,
      content: null,
      order: 1,
      replyToThread: false,
      stepType: "EMAIL",
      timing: { type: "IMMEDIATE" },
    }) as any);
    // findById returns the template WITH deletedAt set — trashed but still
    // resolvable. `deletedAt` lands on TemplateRecord via sub-plan 02; until
    // then the runtime value is what matters (cast as any for the fixture).
    dbMock.template.findById.mockImplementation(
      async () =>
        ({
          id: "tpl_1",
          subject: "Hello {{firstName}}",
          content: "<p>Body</p>",
          deletedAt: new Date(), // soft-deleted
        } as any)
    );
    // determineEmailSubject re-fetches the subject through findSubject (not
    // findById) — must also return the trashed template's subject, or the
    // send would fall back to "No Subject". Both reads see the trashed row.
    dbMock.template.findSubject.mockImplementation(async () => "Hello {{firstName}}" as any);

    const job = { data: makeJobData(), id: JOB_ID + "-trashed" } as any;
    await (processor as any).process(job);

    // The send went out from the trashed template's content.
    expect(sendMock.send).toHaveBeenCalledTimes(1);
    expect(trackingMock.createTracking).toHaveBeenCalledTimes(1);
    // The subject/content sent come from the trashed template, proving it
    // resolved (not from an empty step body). {{firstName}} replaced → "Jane".
    const calls = (sendMock.send as any).mock.calls as any[];
    const sent = calls[0][0];
    expect(sent.subject).toBe("Hello Jane");
    expect(sent.html).toBe("<p>Body</p>");
  });
});
