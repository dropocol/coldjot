/**
 * Integration test — the full send → open → click flow.
 *
 * Phase 7.7 flow 1 (Groups A + B): the highest-value integration canary. Wires
 * the real SendEmailServiceImpl + TrackingServiceImpl against real Prisma repos
 * and a real test DB, with FakeMailTransport standing in for Gmail and the
 * pure-ish module-singleton helpers (`lib/email/helper`, `lib/google/gmail/helper`,
 * `lib/tracking/link-wrap`) mocked so no Gmail client is constructed.
 *
 * Asserts the whole chain end-to-end:
 *   send() → EmailTracking SENT + SENT event + fake-threadId
 *   handleEmailOpen() → OPENED event + openCount 1
 *   handleLinkClick() → CLICKED event + tracked-link clickCount 1
 *
 * Replaces Phase 0's Groups A + B characterization tests end-to-end.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { prisma } from "@coldjot/database";
import { EmailEventEnum } from "@coldjot/types";

// --- Mock the module-singleton seams that touch Gmail ----------------------
// stats reaches prisma via a singleton; isolate the send path's DB writes.
vi.mock("@/lib/stats", () => ({ updateSequenceStats: vi.fn(async () => ({})) }));

// The email-content helpers build raw RFC822 from gmail handles. We don't
// care about the bytes here — only that send() was called with some raw — so
// return minimal stand-ins.
vi.mock("@/lib/email/helper", () => ({
  generateSenderInfo: vi.fn(async (m: any) => ({
    email: m.email,
    name: m.name ?? undefined,
    header: m.email,
  })),
  createEmailMessage: vi.fn(() => "raw-tracked-message"),
  createUntrackedMessage: vi.fn(async () => "raw-untracked-message"),
}));

// getEmailThreadInfo walks a gmail thread; return empty headers.
vi.mock("@/lib/google/gmail/helper", () => ({
  getEmailThreadInfo: vi.fn(async () => ({
    threadHeaders: { inReplyTo: null, references: null, messageId: null },
    originalSubject: "",
  })),
}));

// addTrackingToEmail wraps links + appends the pixel. It calls back to create
// tracked-link rows; preserve that callback so the link-click half has a row
// to resolve. Pass the real tracking id (from the 2nd arg) through to the
// callback so the created TrackedLink satisfies its FK.
vi.mock("@/lib/tracking/link-wrap", async () => {
  const actual: any = await vi.importActual("@/lib/tracking/link-wrap");
  return {
    ...actual,
    addTrackingToEmail: vi.fn(
      async (html: string, tracking: any, onCreateLink: any) => {
        if (onCreateLink) await onCreateLink(tracking.id, "https://example.com");
        return html;
      }
    ),
  };
});

import { SendEmailServiceImpl } from "@/services/domain/send-email.service";
import { TrackingServiceImpl } from "@/services/domain/tracking.service";
import { FakeMailTransport } from "../helpers/fakes";
import {
  seedUser,
  seedSequence,
  seedContact,
  seedEmailTracking,
} from "../helpers/seed";

const SCOPE = "it-sendtrack";
let USER_ID: string;
let SEQ_ID: string;
let CONTACT_ID: string;

const transport = new FakeMailTransport();
const sendService = new SendEmailServiceImpl(prisma, transport);
const trackingService = new TrackingServiceImpl(prisma);

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  USER_ID = `${SCOPE}-user`;
  SEQ_ID = `${SCOPE}-seq`;
  CONTACT_ID = `${SCOPE}-contact`;
  await seedUser(USER_ID);
  await seedSequence(SEQ_ID, USER_ID);
  await seedContact(CONTACT_ID, USER_ID);
});

beforeEach(async () => {
  transport.reset();
  // Wipe this suite's tracking/event/link rows (scoped by sequenceId).
  await prisma.linkClick.deleteMany({
    where: { trackedLink: { emailTracking: { sequenceId: SEQ_ID } } },
  });
  await prisma.trackedLink.deleteMany({
    where: { emailTracking: { sequenceId: SEQ_ID } },
  });
  await prisma.emailEvent.deleteMany({ where: { sequenceId: SEQ_ID } });
  await prisma.emailTracking.deleteMany({ where: { sequenceId: SEQ_ID } });
});

describe("send-and-track (SendEmailServiceImpl + TrackingServiceImpl vs real DB)", () => {
  it("send → open → click writes the full event chain", async () => {
    const tracking = await seedEmailTracking(
      `${SCOPE}-hash-${Date.now()}`,
      USER_ID,
      SEQ_ID,
      CONTACT_ID
    );

    // 1. SEND — transport returns canned ids; service marks tracking SENT.
    const result = await sendService.send({
      userId: USER_ID,
      to: `${CONTACT_ID}@example.com`,
      subject: "Hello",
      html: "<p>Hi <a href='https://example.com'>link</a></p>",
      tracking: { id: tracking.id, hash: tracking.hash } as any,
      sequenceId: SEQ_ID,
      contactId: CONTACT_ID,
      stepId: "step-x",
      mailbox: { id: "mbox-1", email: "from@example.com" } as any,
    } as any);

    expect(result.success).toBe(true);
    expect(result.messageId).toBe(transport.nextSendId);

    // Tracking row advanced to SENT; SENT event written.
    let row = await prisma.emailTracking.findUnique({ where: { id: tracking.id } });
    expect(row?.status).toBe("sent");
    expect(
      await prisma.emailEvent.findFirst({
        where: { trackingId: tracking.id, type: EmailEventEnum.SENT },
      })
    ).not.toBeNull();

    // 2. OPEN — bump openCount + OPENED event.
    await trackingService.handleEmailOpen(tracking.hash);
    row = await prisma.emailTracking.findUnique({ where: { id: tracking.id } });
    expect(row?.openCount).toBe(1);
    expect(row?.status).toBe("opened");
    expect(
      await prisma.emailEvent.findFirst({
        where: { trackingId: tracking.id, type: EmailEventEnum.OPENED },
      })
    ).not.toBeNull();

    // 3. CLICK — resolve the tracked link (created during send via the
    // addTrackingToEmail mock callback) + record the click. handleLinkClick
    // resolves by (hash, linkId) so the click is tied to the right tracking row.
    const link = await prisma.trackedLink.findFirst({
      where: { emailTrackingId: tracking.id },
    });
    expect(link).not.toBeNull();
    await trackingService.handleLinkClick(tracking.hash, link!.id);
    const linkAfter = await prisma.trackedLink.findUnique({ where: { id: link!.id } });
    expect(linkAfter?.clickCount).toBe(1);

    expect(
      await prisma.emailEvent.findFirst({
        where: { trackingId: tracking.id, type: EmailEventEnum.CLICKED },
      })
    ).not.toBeNull();
  });

  it("send throws TOKEN_EXPIRED when the transport rejects with status 401", async () => {
    const trackingHash = `${SCOPE}-hash-401`;
    const tracking = await seedEmailTracking(trackingHash, USER_ID, SEQ_ID, CONTACT_ID);
    const err: any = new Error("Unauthorized");
    err.status = 401;
    transport.sendError = err;
    try {
      await expect(
        sendService.send({
          userId: USER_ID,
          mailbox: { id: `${SCOPE}-mb`, email: "sender@example.com" } as any,
          to: "recipient@example.com",
          subject: "test",
          html: "<p>hi</p>",
          tracking: { id: tracking.id, hash: tracking.hash, pixel: "", wrappedLinks: false } as any,
          sequenceId: SEQ_ID,
          contactId: CONTACT_ID,
          stepId: `${SCOPE}-step`,
          disableSending: false,
        } as any)
      ).rejects.toThrow("TOKEN_EXPIRED");
    } finally {
      transport.sendError = null;
    }
  });
});
