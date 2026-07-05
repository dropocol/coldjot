/**
 * Group A — EmailService.sendEmail characterization tests.
 *
 * Pins the CURRENT behavior of lib/email/index.ts so the Phase 4b refactor
 * (extract SendEmailServiceImpl + GmailTransport) can be proven non-breaking.
 *
 * Source: lib/email/index.ts (EmailService.sendEmail, lines 46–242).
 */
import { vi } from "vitest";
import { setupTestContext, wasCalledWith } from "@/__tests__/helpers/test-context";

// Wire the fakes BEFORE importing the code under test. The vi.mock calls
// inside setupTestContext are hoisted above this import.
const ctx = setupTestContext();

import { SendEmailServiceImpl } from "@/services/domain/send-email.service";
import { EmailEventEnum, EmailTrackingStatusEnum } from "@coldjot/types";
import type { SendEmailOptions } from "@coldjot/types";

beforeEach(() => {
  ctx.reset();
  // Seed the EmailTracking row that sendEmail updates. Both the
  // disableSending path and the real-send path call updateEmailTracking,
  // which does prisma.emailTracking.update({ where: { id } }) — Prisma would
  // throw if the row didn't exist, so the fake must too.
  ctx.fake.seed("emailTracking", {
    id: TRACKING_ID,
    hash: TRACKING_HASH,
    status: "pending",
    openCount: 0,
    sequenceId: SEQ_ID,
    contactId: CONTACT_ID,
    stepId: STEP_ID,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

// ---- fixtures ----------------------------------------------------------

const MAILBOX_ID = "mbx-1";
const USER_ID = "usr-1";
const SEQ_ID = "seq-1";
const CONTACT_ID = "ctc-1";
const STEP_ID = "stp-1";
const TRACKING_ID = "trk-1";
const TRACKING_HASH = "hash-aaaa";

function baseOptions(overrides: Partial<SendEmailOptions> = {}): SendEmailOptions {
  return {
    to: "recipient@example.com",
    subject: "Hello there",
    html: "<p>Hi {{firstName}},</p>",
    replyTo: "sender@coldjot.dev",
    threadId: undefined,
    tracking: {
      id: TRACKING_ID,
      hash: TRACKING_HASH,
      metadata: {
        email: "recipient@example.com",
        userId: USER_ID,
        sequenceId: SEQ_ID,
        stepId: STEP_ID,
        contactId: CONTACT_ID,
      },
      type: "SEQUENCE" as any,
      pixel: "<img src='x'/>",
      wrappedLinks: true,
      trackingId: TRACKING_ID,
    },
    mailbox: {
      id: MAILBOX_ID,
      email: "sender@coldjot.dev",
      name: "Sender",
      userId: USER_ID,
      expiryDate: Date.now() + 3_600_000,
    } as any,
    userId: USER_ID,
    sequenceId: SEQ_ID,
    contactId: CONTACT_ID,
    stepId: STEP_ID,
    ...overrides,
  } as SendEmailOptions;
}

describe("[Group A] EmailService.sendEmail", () => {
  // ---- Case 1: tracked send (happy path) -------------------------------

  it("case 1: tracked happy-path send writes EmailTracking(SENT) + EmailEvent(SENT), inserts untracked, deletes original, bumps stats", async () => {
    vi.useFakeTimers();
    const service = new SendEmailServiceImpl();
    ctx.gmailResponses.send = { id: "msg-99", threadId: "thr-99" };
    ctx.gmailResponses.get = {
      id: "msg-99",
      threadId: "thr-99",
      payload: {
        headers: [
          { name: "Message-ID", value: "<msg-99@test>" },
          { name: "Subject", value: "Hello there" },
        ],
      },
    };
    ctx.gmailResponses.insert = { id: "msg-untracked-99" };

    const promise = service.send(baseOptions());
    await vi.advanceTimersByTimeAsync(1500);
    const result = await promise;

    expect(result).toEqual({
      success: true,
      messageId: "msg-99",
      threadId: "thr-99",
    });

    expect(
      wasCalledWith(ctx, "emailTracking", "update", {
        where: { id: TRACKING_ID },
        data: { status: EmailTrackingStatusEnum.SENT },
      })
    ).toBe(true);

    const events = [...ctx.fake.stores.emailEvent.rows.values()];
    expect(events.some((e) => e.type === EmailEventEnum.SENT)).toBe(true);

    expect(ctx.stats).toHaveBeenCalledWith(
      SEQ_ID,
      EmailEventEnum.SENT,
      CONTACT_ID
    );

    // Real sequence: send → get (sent details) → get (inside createUntrackedMessage)
    // → insert (untracked copy) → delete (original tracked).
    const ops = ctx.fakeGmail.calls.map((c) => c.op);
    expect(ops).toEqual(["send", "get", "get", "insert", "delete"]);
  });

  // ---- Case 2: disableSending shortcut ---------------------------------

  it("case 2: disableSending returns fake IDs and makes NO Gmail calls", async () => {
    const service = new SendEmailServiceImpl();
    const result = await service.send(baseOptions({ disableSending: true }));

    expect(result.success).toBe(true);
    expect(result.isFake).toBe(true);
    expect(result.messageId).toMatch(/^fake-msg-/);
    expect(result.threadId).toMatch(/^fake-thread-/);

    // No Gmail transport calls at all
    expect(ctx.fakeGmail.calls).toHaveLength(0);

    // EmailTracking.update + nested event still fire (current behavior).
    expect(
      ctx.fake.calls.some(
        (c) => c.model === "emailTracking" && c.op === "update"
      )
    ).toBe(true);
  });

  // ---- Case 3: auth failure throws TOKEN_EXPIRED -----------------------

  it("case 3a: 401 from gmail.users.messages.send throws TOKEN_EXPIRED", async () => {
    const service = new SendEmailServiceImpl();
    const mod = await import("@/lib/google");
    const originalGetClient = (mod.gmailClientService as any).getClient;
    const throwingClient: any = {
      users: {
        messages: {
          send: async () => {
            const e: any = new Error("Unauthorized");
            e.status = 401;
            throw e;
          },
          get: async () => ({ data: {} }),
        },
      },
      threads: { get: async () => ({ data: { messages: [] } }) },
    };
    (mod.gmailClientService as any).getClient = async () => throwingClient;
    try {
      await expect(service.send(baseOptions())).rejects.toThrow(
        "TOKEN_EXPIRED"
      );
    } finally {
      (mod.gmailClientService as any).getClient = originalGetClient;
    }
  });

  it("case 3b: SMTP 535 / AUTH XOAUTH2 also throws TOKEN_EXPIRED", async () => {
    const service = new SendEmailServiceImpl();
    const mod = await import("@/lib/google");
    const originalGetClient = (mod.gmailClientService as any).getClient;
    const throwingClient: any = {
      users: {
        messages: {
          send: async () => {
            const e: any = new Error("Auth failed");
            e.responseCode = 535;
            e.command = "AUTH XOAUTH2";
            throw e;
          },
          get: async () => ({ data: {} }),
        },
      },
      threads: { get: async () => ({ data: { messages: [] } }) },
    };
    (mod.gmailClientService as any).getClient = async () => throwingClient;
    try {
      await expect(service.send(baseOptions())).rejects.toThrow(
        "TOKEN_EXPIRED"
      );
    } finally {
      (mod.gmailClientService as any).getClient = originalGetClient;
    }
  });

  // ---- Case 4: untracked-copy sequence + 1s delay ----------------------

  it("case 4: send path waits ~1s between send and get-details (delay pinned)", async () => {
    vi.useFakeTimers();
    const service = new SendEmailServiceImpl();
    ctx.gmailResponses.send = { id: "msg-7", threadId: "thr-7" };
    ctx.gmailResponses.get = {
      id: "msg-7",
      threadId: "thr-7",
      payload: { headers: [{ name: "Message-ID", value: "<m7>" }, { name: "Subject", value: "S" }] },
    };
    ctx.gmailResponses.insert = { id: "u7" };

    const promise = service.send(baseOptions());

    // Right after send, get should NOT have been called yet (sleeping 1s).
    await vi.advanceTimersByTimeAsync(500);
    expect(ctx.fakeGmail.calls.some((c) => c.op === "get")).toBe(false);

    // After the full second, get fires.
    await vi.advanceTimersByTimeAsync(1000);
    await promise;
    expect(ctx.fakeGmail.calls.some((c) => c.op === "get")).toBe(true);
  });

  // ---- Case 5: empty html throws (current behavior) --------------------

  it("case 5: empty html causes addTrackingToEmail to throw 'Content and tracking information are required'", async () => {
    // Pin the current behavior: addTrackingToEmail guards on falsy content
    // and throws. This is NOT a success path — it's the documented failure.
    const service = new SendEmailServiceImpl();
    await expect(service.send(baseOptions({ html: "" }))).rejects.toThrow(
      "Content and tracking information are required"
    );
    // TODO(behavior): this is arguably a bug — empty html should probably
    // skip the untracked-copy block gracefully. Phase 4b may change it.
  });
});
