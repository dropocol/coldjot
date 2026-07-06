/**
 * Unit tests for SendEmailServiceImpl (Group A).
 *
 * Phase 7.2: the service's three main deps (transport + 2 repos) are
 * constructor-injected with fakes. The four module-singleton helpers it also
 * reaches (`lib/email/helper`, `lib/google/gmail/helper`, `lib/tracking/link-wrap`,
 * `lib/stats`) are mocked here — same pattern the integration send-and-track
 * test uses, but isolated to the service's own branching logic.
 *
 * Covers: tracked happy-path send (op order, tracking SENT + event), the
 * disableSending shortcut (fake IDs, no Gmail), and the 401→TOKEN_EXPIRED
 * contract. Replaces the Group A characterization test's core cases.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// --- Mock the four module-singleton seams (hoisted) ------------------------

const emailHelper = vi.hoisted(() => ({
  generateSenderInfo: vi.fn(async () => ({ email: "s@x", name: undefined, header: "s@x" })),
  createEmailMessage: vi.fn(() => "raw-tracked"),
  createUntrackedMessage: vi.fn(async () => "raw-untracked"),
}));
vi.mock("@/lib/email/helper", () => emailHelper);

const gmailHelper = vi.hoisted(() => ({
  getEmailThreadInfo: vi.fn(async () => ({
    threadHeaders: { inReplyTo: null, references: null, messageId: null },
    originalSubject: "",
  })),
}));
vi.mock("@/lib/google/gmail/helper", () => gmailHelper);

const linkWrap = vi.hoisted(() => ({
  addTrackingToEmail: vi.fn(async (html: string) => html),
}));
vi.mock("@/lib/tracking/link-wrap", async () => {
  const actual: any = await vi.importActual("@/lib/tracking/link-wrap");
  return { ...actual, addTrackingToEmail: linkWrap.addTrackingToEmail };
});

const stats = vi.hoisted(() => ({ updateSequenceStats: vi.fn(async () => ({})) }));
vi.mock("@/lib/stats", () => stats);

import { SendEmailServiceImpl } from "@/services/domain/send-email.service";
import { FakeMailTransport } from "@/__tests__/helpers/fakes";
import { FakeEmailTrackingRepository } from "@/__tests__/helpers/fakes";
import { FakeTrackedLinkRepository } from "@/__tests__/helpers/fakes";
import type { SendEmailOptions } from "@coldjot/types";

let transport: FakeMailTransport;
let emailTracking: FakeEmailTrackingRepository;
let trackedLink: FakeTrackedLinkRepository;
let service: SendEmailServiceImpl;

const TRACKING_ID = "trk-1";
const TRACKING_HASH = "hash-1";
const SEQ_ID = "seq-1";
const CONTACT_ID = "ctc-1";
const STEP_ID = "stp-1";
const USER_ID = "usr-1";
const MAILBOX_ID = "mbx-1";

function baseOptions(overrides: Partial<SendEmailOptions> = {}): SendEmailOptions {
  return {
    to: "recipient@example.com",
    subject: "Hello there",
    html: "<p>Hi</p>",
    tracking: { id: TRACKING_ID, hash: TRACKING_HASH } as any,
    mailbox: { id: MAILBOX_ID, email: "sender@x", name: "Sender", userId: USER_ID } as any,
    userId: USER_ID,
    sequenceId: SEQ_ID,
    contactId: CONTACT_ID,
    stepId: STEP_ID,
    ...overrides,
  } as SendEmailOptions;
}

beforeEach(() => {
  vi.clearAllMocks();
  // The send path has a 1s real delay between send and get-details (Gmail
  // propagation wait). Fake timers skip it so the test runs in milliseconds.
  vi.useFakeTimers();
  transport = new FakeMailTransport();
  emailTracking = new FakeEmailTrackingRepository();
  trackedLink = new FakeTrackedLinkRepository();
  service = new SendEmailServiceImpl(transport, emailTracking, trackedLink);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Seed the tracking row the service's markSent will update, with a fixed id. */
async function seedTracking() {
  await emailTracking.createPending({
    id: TRACKING_ID,
    hash: TRACKING_HASH,
    userId: USER_ID,
    sequenceId: SEQ_ID,
    contactId: CONTACT_ID,
    stepId: STEP_ID,
    metadata: {} as any,
  } as any);
}

describe("[Group A] SendEmailServiceImpl.send — disableSending shortcut", () => {
  it("returns fake IDs, makes no Gmail calls, and writes tracking SENT + SENT event", async () => {
    await seedTracking();

    const result = await service.send(baseOptions({ disableSending: true }));

    expect(result.success).toBe(true);
    expect(result.isFake).toBe(true);
    expect(result.messageId).toMatch(/^fake-msg-/);

    // No transport calls at all.
    expect(transport.calls.filter((c) => c.method === "send")).toHaveLength(0);

    // Tracking advanced to SENT.
    const row = await emailTracking.findById(TRACKING_ID);
    expect(row?.status.toLowerCase()).toBe("sent");

    // Stats bumped for the SENT event.
    expect(stats.updateSequenceStats).toHaveBeenCalledWith(
      SEQ_ID,
      "sent",
      CONTACT_ID
    );
  });
});

describe("[Group A] SendEmailServiceImpl.send — tracked happy path", () => {
  it("sends via transport, inserts untracked copy, deletes original, marks SENT", async () => {
    await seedTracking();

    const promise = service.send(baseOptions());
    // Advance past the 1s Gmail-propagation delay inside send().
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.messageId).toBe(transport.nextSendId);

    // Transport operation order: send → getSentDetails → insert → delete.
    const ops = transport.calls.map((c) => c.method);
    expect(ops).toEqual(
      expect.arrayContaining(["send", "getSentDetails", "insert", "delete"])
    );
    const sendIdx = ops.indexOf("send");
    const deleteIdx = ops.indexOf("delete");
    expect(sendIdx).toBeLessThan(deleteIdx);

    // Tracking advanced to SENT.
    const row = await emailTracking.findById(TRACKING_ID);
    expect(row?.status.toLowerCase()).toBe("sent");
    expect(row?.messageId).toBe(transport.nextSendId);
  });
});

describe("[Group A] SendEmailServiceImpl.send — auth-failure contract", () => {
  it("throws TOKEN_EXPIRED when the transport send rejects with status 401", async () => {
    await seedTracking();
    const err: any = new Error("Unauthorized");
    err.status = 401;
    transport.sendError = err;

    await expect(service.send(baseOptions())).rejects.toThrow("TOKEN_EXPIRED");
  });
});
