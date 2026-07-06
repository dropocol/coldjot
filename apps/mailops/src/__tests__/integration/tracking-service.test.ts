/**
 * Integration test — TrackingServiceImpl against a real Postgres test DB.
 *
 * Phase 7.7 representative: exercises the real service → real Prisma repos →
 * real DB path end-to-end (no module mocking of @coldjot/database). The
 * TrackingServiceImpl is the canonical open/click path; this is the canary for
 * "did we wire the tracking layer end-to-end correctly against a real DB?".
 *
 * Requires DATABASE_URL_TEST → coldjot_test with migrations applied. Gmail is
 * not involved (tracking is DB-only), so this is a pure DB integration test.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { prisma } from "@coldjot/database";
import { EmailEventEnum } from "@coldjot/types";

// updateSequenceStats still reaches prisma via lib/stats; mock it so the test
// isolates the tracking service's own DB writes.
vi.mock("@/lib/stats", () => ({ updateSequenceStats: vi.fn(async () => ({})) }));

import { TrackingServiceImpl } from "@/services/domain/tracking.service";

const USER_ID = "itest-tracking-user";
const SEQ_ID = "itest-tracking-seq";
const STEP_ID = "itest-tracking-step";
const CONTACT_ID = "itest-tracking-contact";

const service = new TrackingServiceImpl(prisma);

async function truncate() {
  await prisma.linkClick.deleteMany();
  await prisma.trackedLink.deleteMany();
  await prisma.emailEvent.deleteMany();
  await prisma.emailTracking.deleteMany();
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await prisma.user.upsert({
    where: { id: USER_ID },
    update: {},
    create: { id: USER_ID, email: "itest-tracking@example.com" },
  });
  await prisma.sequence.upsert({
    where: { id: SEQ_ID },
    update: {},
    create: { id: SEQ_ID, name: "itest seq", userId: USER_ID },
  });
  await prisma.sequenceStep.upsert({
    where: { id: STEP_ID },
    update: {},
    create: { id: STEP_ID, sequenceId: SEQ_ID, order: 1 },
  });
  await prisma.contact.upsert({
    where: { id: CONTACT_ID },
    update: {},
    create: {
      id: CONTACT_ID,
      firstName: "Ada",
      lastName: "L",
      name: "Ada L",
      email: "ada@example.com",
      userId: USER_ID,
    },
  });
});

beforeEach(async () => {
  await truncate();
});

describe("TrackingServiceImpl against real DB", () => {
  it("createTracking → handleEmailOpen → OPENED event written + openCount incremented", async () => {
    // 1. createTracking writes a pending EmailTracking row.
    const tracking = await service.createTracking({
      email: "ada@example.com",
      userId: USER_ID,
      sequenceId: SEQ_ID,
      stepId: STEP_ID,
      contactId: CONTACT_ID,
    } as any);

    // Row exists in the DB at status pending.
    const row = await prisma.emailTracking.findUnique({ where: { hash: tracking.hash } });
    expect(row?.status).toBe("pending");
    expect(row?.openCount).toBe(0);

    // 2. handleEmailOpen bumps openCount + writes an OPENED event + sets status.
    await service.handleEmailOpen(tracking.hash);

    const after = await prisma.emailTracking.findUnique({ where: { hash: tracking.hash } });
    expect(after?.openCount).toBe(1);
    expect(after?.status).toBe("opened");

    const opened = await prisma.emailEvent.findFirst({
      where: { trackingId: row!.id, type: EmailEventEnum.OPENED },
    });
    expect(opened).not.toBeNull();
  });

  it("handleEmailOpen on an unknown hash is a no-op (no row created)", async () => {
    await service.handleEmailOpen("no-such-hash");
    const count = await prisma.emailTracking.count();
    expect(count).toBe(0);
  });

  it("trackEmailEvent writes the event + sets tracking status", async () => {
    const tracking = await service.createTracking({
      email: "ada@example.com",
      userId: USER_ID,
      sequenceId: SEQ_ID,
      stepId: STEP_ID,
      contactId: CONTACT_ID,
    } as any);

    await service.trackEmailEvent({
      trackingId: tracking.id,
      eventType: EmailEventEnum.CLICKED,
    });

    const after = await prisma.emailTracking.findUnique({ where: { id: tracking.id } });
    expect(after?.status).toBe("clicked");
    const clicked = await prisma.emailEvent.findFirst({
      where: { trackingId: tracking.id, type: EmailEventEnum.CLICKED },
    });
    expect(clicked).not.toBeNull();
  });

  it("createTracking throws when required metadata fields are missing", async () => {
    await expect(
      service.createTracking({
        email: "x@example.com",
        userId: "",
        sequenceId: SEQ_ID,
        stepId: STEP_ID,
        contactId: CONTACT_ID,
      } as any)
    ).rejects.toThrow(/Missing required metadata fields/);
  });

  it("handleLinkClick on an unknown hash throws 'Invalid tracking data'", async () => {
    await expect(service.handleLinkClick("no-such-hash", "lid")).rejects.toThrow(
      /Invalid tracking data/
    );
  });

  it("trackEmailEvent throws when the tracking row is missing", async () => {
    await expect(
      service.trackEmailEvent({ trackingId: "nope", eventType: EmailEventEnum.SPAM })
    ).rejects.toThrow(/Email tracking record not found/);
  });
});
