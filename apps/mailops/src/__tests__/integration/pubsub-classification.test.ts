/**
 * Integration test — PubSub inbox-sync classification (reply / bounce / skip).
 *
 * Phase 7.7 flows 3–6 (Group C): the heart of the inbox-sync pipeline is
 * `applyClassification` — it writes the bounce/reply EmailEvent, marks the
 * SequenceContact terminal, and bumps stats. Testing the full
 * `InboxSyncServiceImpl.handleNotification` end-to-end requires extensive Gmail
 * history mocking (token refresh, fetchHistory, fetchMessage, classify); that
 * surface is already pinned by the Group C characterization tests + the
 * unit/services/inbox-sync test. This file exercises the classification
 * outcomes against a real DB — the part that's genuinely DB-coupled and that
 * the characterization tests mock through.
 *
 * Cases (mapped to the 7.7 sub-plan):
 *   flow 3 (reply)    → REPLIED event + contact marked terminal
 *   flow 4 (bounce)   → BOUNCED event + contact marked terminal
 *   flow 5 (original) → no event, no contact change (early return)
 *   flow 6 (dedupe)   → replaying a reply is a no-op (idempotency)
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { prisma } from "@coldjot/database";
import { EmailEventEnum, NotificationType } from "@coldjot/types";

vi.mock("@/lib/stats", () => ({ updateSequenceStats: vi.fn(async () => ({})) }));

import { applyClassification } from "@/services/inbox-sync/apply-classification";
import { PrismaEmailEventRepository } from "@/repositories/prisma/prisma-email-event.repo";
import { PrismaSequenceContactRepository } from "@/repositories/prisma/prisma-sequence-contact.repo";
import { PrismaEmailThreadRepository } from "@/repositories/prisma/prisma-email-thread.repo";
import {
  seedUser,
  seedSequence,
  seedContact,
  seedEmailTracking,
} from "../helpers/seed";

const SCOPE = "it-pubsub";
let USER_ID: string;
let SEQ_ID: string;
let CONTACT_ID: string;

const deps = {
  emailEvent: new PrismaEmailEventRepository(),
  sequenceContact: new PrismaSequenceContactRepository(),
  emailThread: new PrismaEmailThreadRepository(),
};

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
  // Wipe this suite's rows, scoped by sequenceId where possible.
  await prisma.emailEvent.deleteMany({ where: { sequenceId: SEQ_ID } });
  await prisma.emailThread.deleteMany({ where: { sequenceId: SEQ_ID } });
  await prisma.emailTracking.deleteMany({ where: { sequenceId: SEQ_ID } });
  await prisma.sequenceContact.deleteMany({ where: { sequenceId: SEQ_ID } });
});

/** Seed the full graph a bounce/reply needs: tracking + SENT event + thread + contact link. */
async function seedSentConversation(threadId: string) {
  const tracking = await seedEmailTracking(
    `${SCOPE}-hash-${threadId}-${Date.now()}`,
    USER_ID,
    SEQ_ID,
    CONTACT_ID
  );
  // The SENT event that the bounce/reply attaches to.
  await prisma.emailEvent.create({
    data: {
      trackingId: tracking.id,
      type: EmailEventEnum.SENT,
      sequenceId: SEQ_ID,
      contactId: CONTACT_ID,
    },
  });
  // The thread row applyClassification resolves to find sequenceId/contactId.
  await prisma.emailThread.create({
    data: {
      threadId,
      sequenceId: SEQ_ID,
      contactId: CONTACT_ID,
      userId: USER_ID,
      firstMessageId: "msg-original",
      subject: "Outreach",
    },
  });
  // The SequenceContact the terminal-status update targets.
  await prisma.sequenceContact.create({
    data: { sequenceId: SEQ_ID, contactId: CONTACT_ID, status: "in_progress" },
  });
  return tracking;
}

describe("pubsub classification (applyClassification vs real DB)", () => {
  it("flow 3 — REPLY writes the REPLIED event + marks the contact terminal", async () => {
    await seedSentConversation("thr-reply");
    const res = await applyClassification({
      change: {
        id: "rec-reply",
        threadId: "thr-reply",
        type: NotificationType.REPLY,
        messageId: "msg-reply",
        from: "recipient@example.com",
      },
      deps,
    });
    expect(res).not.toBeNull();

    const event = await prisma.emailEvent.findFirst({
      where: { sequenceId: SEQ_ID, type: EmailEventEnum.REPLIED },
    });
    expect(event).not.toBeNull();

    const sc = await prisma.sequenceContact.findFirst({
      where: { sequenceId: SEQ_ID, contactId: CONTACT_ID },
    });
    expect(sc?.completed).toBe(true);
  });

  it("flow 4 — BOUNCE writes the BOUNCED event + marks the contact terminal", async () => {
    await seedSentConversation("thr-bounce");
    const res = await applyClassification({
      change: {
        id: "rec-bounce",
        threadId: "thr-bounce",
        type: NotificationType.BOUNCE,
        messageId: "msg-bounce",
        from: "mailer-daemon@example.com",
      },
      deps,
    });
    expect(res).not.toBeNull();
    const event = await prisma.emailEvent.findFirst({
      where: { sequenceId: SEQ_ID, type: EmailEventEnum.BOUNCED },
    });
    expect(event).not.toBeNull();
    const sc = await prisma.sequenceContact.findFirst({
      where: { sequenceId: SEQ_ID, contactId: CONTACT_ID },
    });
    expect(sc?.completed).toBe(true);
  });

  it("flow 5 — ORIGINAL_MESSAGE is a no-op (returns null, writes nothing)", async () => {
    await seedSentConversation("thr-orig");
    const res = await applyClassification({
      change: {
        id: "rec-orig",
        threadId: "thr-orig",
        type: NotificationType.ORIGINAL_MESSAGE,
        messageId: "msg-orig",
        from: "self@example.com",
      },
      deps,
    });
    expect(res).toBeNull();
    const count = await prisma.emailEvent.count({ where: { sequenceId: SEQ_ID } });
    // Only the seeded SENT event exists.
    expect(count).toBe(1);
  });

  it("flow 6 — replaying a reply is idempotent (second call writes nothing)", async () => {
    await seedSentConversation("thr-dedupe");
    const first = await applyClassification({
      change: { id: "rec-dedupe-1", threadId: "thr-dedupe", type: NotificationType.REPLY, messageId: "msg-r1", from: "r@example.com" },
      deps,
    });
    const second = await applyClassification({
      change: { id: "rec-dedupe-2", threadId: "thr-dedupe", type: NotificationType.REPLY, messageId: "msg-r2", from: "r@example.com" },
      deps,
    });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    const events = await prisma.emailEvent.findMany({
      where: { sequenceId: SEQ_ID, type: EmailEventEnum.REPLIED },
    });
    expect(events).toHaveLength(1);
  });

  it("returns null when no EmailThread exists for the threadId", async () => {
    const res = await applyClassification({
      change: { id: "rec-none", threadId: "no-such-thread", type: NotificationType.REPLY, messageId: "m", from: "x" },
      deps,
    });
    expect(res).toBeNull();
  });
});
