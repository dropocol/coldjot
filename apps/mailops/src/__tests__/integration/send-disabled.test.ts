/**
 * Integration test — send-email with disableSending=true.
 *
 * Phase 7.7 flow 2 (Group A): the disableSending shortcut returns fake IDs
 * without touching Gmail, but still writes the EmailTracking row (status SENT)
 * + the SENT event. This is the cleanest send-path canary — no Gmail, no
 * module-singleton seams to mock, just SendEmailServiceImpl → real Prisma repos.
 *
 * `lib/stats.updateSequenceStats` is mocked because it reaches prisma via a
 * module singleton; the tracking + event writes are what we assert on.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { prisma } from "@coldjot/database";
import { EmailEventEnum } from "@coldjot/types";

vi.mock("@/lib/stats", () => ({ updateSequenceStats: vi.fn(async () => ({})) }));

import { SendEmailServiceImpl } from "@/services/domain/send-email.service";
import { FakeMailTransport } from "../helpers/fakes";
import {
  seedUser,
  seedSequence,
  seedContact,
  seedEmailTracking,
} from "../helpers/seed";

const SCOPE = "it-sendoff";
let USER_ID: string;
let SEQ_ID: string;
let CONTACT_ID: string;

const transport = new FakeMailTransport();
const service = new SendEmailServiceImpl(prisma, transport);

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
  await prisma.emailEvent.deleteMany({
    where: { sequenceId: SEQ_ID },
  });
  await prisma.emailTracking.deleteMany({
    where: { sequenceId: SEQ_ID },
  });
});

describe("send-email disabled (SendEmailServiceImpl vs real DB)", () => {
  it("disableSending returns fake IDs, makes no Gmail calls, and writes tracking + SENT event", async () => {
    const tracking = await seedEmailTracking(
      `${SCOPE}-hash-${Date.now()}`,
      USER_ID,
      SEQ_ID,
      CONTACT_ID
    );

    const result = await service.send({
      userId: USER_ID,
      to: `${CONTACT_ID}@example.com`,
      subject: "Hello",
      html: "<p>Hi</p>",
      tracking: { id: tracking.id, hash: tracking.hash } as any,
      sequenceId: SEQ_ID,
      contactId: CONTACT_ID,
      stepId: "step-x",
      mailbox: { id: "mbox-1", email: "from@example.com" } as any,
      disableSending: true,
    } as any);

    // Fake IDs returned, flagged as fake.
    expect(result.success).toBe(true);
    expect(result.isFake).toBe(true);
    expect(result.messageId).toMatch(/^fake-msg-/);
    expect(result.threadId).toMatch(/^fake-thread-/);

    // No Gmail transport calls at all.
    expect(transport.sends).toHaveLength(0);
    expect(transport.inserts).toHaveLength(0);

    // The tracking row was advanced to SENT + a SENT event was written.
    const after = await prisma.emailTracking.findUnique({ where: { id: tracking.id } });
    expect(after?.status).toBe("sent");
    const sent = await prisma.emailEvent.findFirst({
      where: { trackingId: tracking.id, type: EmailEventEnum.SENT },
    });
    expect(sent).not.toBeNull();
  });
});
