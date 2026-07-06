/**
 * Repository test — PrismaEmailEventRepository against a real test Postgres.
 *
 * Phase 7.5: covers every EmailEventRepository method. EmailEvent has FKs on
 * trackingId (required) + sequenceId/contactId (nullable). The fast tier
 * leaves DATABASE_URL_TEST unset; this file only runs under test:integration.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@coldjot/database";
import { EmailEventEnum } from "@coldjot/types";
import { PrismaEmailEventRepository } from "@/repositories/prisma/prisma-email-event.repo";
import {
  seedUser,
  seedSequence,
  seedContact,
  seedEmailTracking,
} from "../helpers/seed";

const repo = new PrismaEmailEventRepository();
const SCOPE = "evt";

let USER_ID: string;
let SEQ_ID: string;
let CONTACT_ID: string;
let TRACKING_ID: string;

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
  await prisma.emailEvent.deleteMany();
  await prisma.emailTracking.deleteMany();
  TRACKING_ID = (await seedEmailTracking(`${SCOPE}-hash-${Date.now()}`, USER_ID, SEQ_ID, CONTACT_ID)).id;
});

describe("PrismaEmailEventRepository", () => {
  it("create writes a row with the given type + metadata", async () => {
    const row = await repo.create({
      trackingId: TRACKING_ID,
      type: EmailEventEnum.OPENED,
      sequenceId: SEQ_ID,
      contactId: CONTACT_ID,
      metadata: { ip: "1.2.3.4" } as any,
    });
    expect(row.type).toBe(EmailEventEnum.OPENED);
    expect(row.trackingId).toBe(TRACKING_ID);
  });

  it("findFirstByTrackingAndType matches trackingId + type", async () => {
    await repo.create({ trackingId: TRACKING_ID, type: EmailEventEnum.OPENED });
    const found = await repo.findFirstByTrackingAndType(TRACKING_ID, EmailEventEnum.OPENED);
    expect(found).not.toBeNull();
    expect(await repo.findFirstByTrackingAndType(TRACKING_ID, EmailEventEnum.CLICKED)).toBeNull();
  });

  it("findFirstByTrackingTypeSequence narrows by sequenceId", async () => {
    await repo.create({
      trackingId: TRACKING_ID,
      type: EmailEventEnum.OPENED,
      sequenceId: SEQ_ID,
    });
    expect(
      await repo.findFirstByTrackingTypeSequence(TRACKING_ID, EmailEventEnum.OPENED, SEQ_ID)
    ).not.toBeNull();
    expect(
      await repo.findFirstByTrackingTypeSequence(TRACKING_ID, EmailEventEnum.OPENED, "other-seq")
    ).toBeNull();
  });

  it("findFirstBySequenceContactType matches the triple", async () => {
    await repo.create({
      trackingId: TRACKING_ID,
      type: EmailEventEnum.REPLIED,
      sequenceId: SEQ_ID,
      contactId: CONTACT_ID,
    });
    const found = await repo.findFirstBySequenceContactType(
      SEQ_ID,
      CONTACT_ID,
      EmailEventEnum.REPLIED
    );
    expect(found).not.toBeNull();
  });

  it("countBySequenceContactType counts matching rows", async () => {
    await repo.create({ trackingId: TRACKING_ID, type: EmailEventEnum.OPENED, sequenceId: SEQ_ID, contactId: CONTACT_ID });
    await repo.create({ trackingId: TRACKING_ID, type: EmailEventEnum.OPENED, sequenceId: SEQ_ID, contactId: CONTACT_ID });
    expect(await repo.countBySequenceContactType(SEQ_ID, CONTACT_ID, EmailEventEnum.OPENED)).toBe(2);
    expect(await repo.countBySequenceContactType(SEQ_ID, CONTACT_ID, EmailEventEnum.CLICKED)).toBe(0);
  });

  it("existsBySequenceContactInTypes returns true when any type matches", async () => {
    await repo.create({
      trackingId: TRACKING_ID,
      type: EmailEventEnum.BOUNCED,
      sequenceId: SEQ_ID,
      contactId: CONTACT_ID,
    });
    expect(
      await repo.existsBySequenceContactInTypes(SEQ_ID, CONTACT_ID, [
        EmailEventEnum.REPLIED,
        EmailEventEnum.BOUNCED,
      ])
    ).toBe(true);
    expect(
      await repo.existsBySequenceContactInTypes(SEQ_ID, CONTACT_ID, [EmailEventEnum.REPLIED])
    ).toBe(false);
  });

  it("listByTracking returns events ordered newest-first", async () => {
    await repo.create({ trackingId: TRACKING_ID, type: EmailEventEnum.OPENED, timestamp: new Date(1) });
    await repo.create({ trackingId: TRACKING_ID, type: EmailEventEnum.SENT, timestamp: new Date(2) });
    const rows = await repo.listByTracking(TRACKING_ID);
    expect(rows).toHaveLength(2);
    expect(rows[0].timestamp.getTime()).toBeGreaterThanOrEqual(rows[1].timestamp.getTime());
  });

  it("deleteBySequence removes only events for that sequence", async () => {
    const otherTracking = (await seedEmailTracking(`${SCOPE}-other-${Date.now()}`, USER_ID)).id;
    await repo.create({ trackingId: TRACKING_ID, type: EmailEventEnum.OPENED, sequenceId: SEQ_ID });
    await repo.create({ trackingId: otherTracking, type: EmailEventEnum.OPENED });
    await repo.deleteBySequence(SEQ_ID);
    expect(await repo.listByTracking(TRACKING_ID)).toHaveLength(0);
    expect(await repo.listByTracking(otherTracking)).toHaveLength(1);
  });
});
