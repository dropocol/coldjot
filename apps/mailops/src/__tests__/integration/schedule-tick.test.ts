/**
 * Integration test — one schedule tick enqueues due email jobs.
 *
 * Phase 7.7 flow 9 (Group D): exercises RunScheduleServiceImpl → real Prisma
 * repos → real DB, with fakes for JobManager + RateLimitService + a stub
 * ScheduleGenerator (the real generator's DST/business-hours logic is its own
 * unit-test concern — here we just assert the tick wires it through). Replaces
 * Phase 0's Group D characterization test end-to-end.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@coldjot/database";
import { SequenceStatus } from "@coldjot/types";
import { RunScheduleServiceImpl } from "@/services/domain/run-schedule.service";
import { PrismaSequenceContactRepository } from "@/repositories/prisma/prisma-sequence-contact.repo";
import { PrismaSequenceStepRepository } from "@/repositories/prisma/prisma-sequence-step.repo";
import { FakeJobManager, FakeRateLimitService } from "../helpers/fakes";
import {
  seedUser,
  seedSequence,
  seedContact,
  seedSequenceStep,
} from "../helpers/seed";

const SCOPE = "it-tick";
let USER_ID: string;
let SEQ_ID: string;
let CONTACT_ID: string;
let STEP_ID: string;

const jobManager = new FakeJobManager();
const rateLimit = new FakeRateLimitService();
// Stub the generator — return a fixed near-future time so the tick always enqueues.
const scheduleGen = {
  async calculateNextRun() {
    return new Date(Date.now() + 60_000);
  },
};

const service = new RunScheduleServiceImpl(
  new PrismaSequenceContactRepository(),
  new PrismaSequenceStepRepository(),
  jobManager as any,
  rateLimit,
  scheduleGen as any
);

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  USER_ID = `${SCOPE}-user`;
  SEQ_ID = `${SCOPE}-seq`;
  CONTACT_ID = `${SCOPE}-contact`;
  STEP_ID = `${SCOPE}-step-1`;
  await seedUser(USER_ID);
  await seedSequence(SEQ_ID, USER_ID, { status: SequenceStatus.ACTIVE });
  await seedContact(CONTACT_ID, USER_ID);
  await seedSequenceStep(STEP_ID, SEQ_ID, 1);
});

beforeEach(async () => {
  jobManager.reset();
  rateLimit.reset();
  await prisma.sequenceContact.deleteMany({ where: { sequenceId: SEQ_ID } });
});

describe("schedule tick (RunScheduleServiceImpl vs real DB)", () => {
  it("enqueues an email job for a due contact + marks it SCHEDULED + bumps counters", async () => {
    // A due contact: status in_progress, nextScheduledAt in the past, currentStep 1.
    await prisma.sequenceContact.create({
      data: {
        sequenceId: SEQ_ID,
        contactId: CONTACT_ID,
        status: "in_progress",
        currentStep: 1,
        nextScheduledAt: new Date(Date.now() - 60_000),
      },
    });

    const { enqueued } = await service.tick();

    // At least our contact was enqueued (other suites may add due contacts too).
    expect(enqueued).toBeGreaterThanOrEqual(1);
    // Our contact's job is present.
    const ourJob = jobManager.emailJobs.find(
      (j) => j.sequenceId === SEQ_ID && j.contactId === CONTACT_ID
    );
    expect(ourJob).toBeTruthy();
    expect(ourJob!.stepId).toBe(STEP_ID);
    expect(ourJob!.to).toBe(`${CONTACT_ID}@example.com`);
    expect(ourJob!.scheduledTime).toBeTruthy();

    // The contact was advanced to SCHEDULED.
    const after = await prisma.sequenceContact.findFirst({
      where: { sequenceId: SEQ_ID, contactId: CONTACT_ID },
    });
    expect(after?.status).toBe("scheduled");

    // Our contact's rate-limit counter was incremented.
    expect(
      rateLimit.incrementCalls.some(
        (c) => c.sequenceId === SEQ_ID && c.contactId === CONTACT_ID
      )
    ).toBe(true);
  });

  it("skips a contact when the rate limit denies it (no job enqueued for it)", async () => {
    rateLimit.allowed = false;
    await prisma.sequenceContact.create({
      data: {
        sequenceId: SEQ_ID,
        contactId: CONTACT_ID,
        status: "in_progress",
        currentStep: 1,
        nextScheduledAt: new Date(Date.now() - 60_000),
      },
    });

    await service.tick();

    // Our contact was checked but NOT enqueued (rate limit denied).
    expect(
      rateLimit.checkCalls.some(
        (c) => c.sequenceId === SEQ_ID && c.contactId === CONTACT_ID
      )
    ).toBe(true);
    expect(
      jobManager.emailJobs.some(
        (j) => j.sequenceId === SEQ_ID && j.contactId === CONTACT_ID
      )
    ).toBe(false);
    // Our contact was NOT advanced to scheduled.
    const after = await prisma.sequenceContact.findFirst({
      where: { sequenceId: SEQ_ID, contactId: CONTACT_ID },
    });
    expect(after?.status).toBe("in_progress");
  });

  it("is a no-op for this suite's sequence when none of its contacts are due", async () => {
    await service.tick();
    // No jobs enqueued for our sequence.
    expect(
      jobManager.emailJobs.some((j) => j.sequenceId === SEQ_ID)
    ).toBe(false);
  });

  it("no-ops a contact whose current step was deleted (cleans up without enqueuing)", async () => {
    // currentStep 5 but the sequence has only 1 step, and step order 5 doesn't exist.
    await prisma.sequenceContact.create({
      data: {
        sequenceId: SEQ_ID,
        contactId: CONTACT_ID,
        status: "in_progress",
        currentStep: 5,
        nextScheduledAt: new Date(Date.now() - 60_000),
      },
    });
    await service.tick();
    // No job enqueued for our (deleted-step) contact.
    expect(
      jobManager.emailJobs.some(
        (j) => j.sequenceId === SEQ_ID && j.contactId === CONTACT_ID
      )
    ).toBe(false);
  });
});
