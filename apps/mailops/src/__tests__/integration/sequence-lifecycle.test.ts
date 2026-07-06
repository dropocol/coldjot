/**
 * Integration test — sequence lifecycle (launch/pause/resume/reset).
 *
 * Phase 7.7 flow 8 (Group E): exercises LaunchSequenceServiceImpl → real Prisma
 * repos → real DB, with fakes for the infra collaborators (JobManager +
 * MonitoringService + RateLimitService). Replaces Phase 0's Group E
 * characterization test end-to-end.
 *
 * NOTE: reset() reaches `resetSequence(sequenceId)` which imports `lib/mailbox`
 * → `lib/google/gmail/helper` transitively. Those module loads are safe (no
 * Gmail calls are made for reset), but to keep the test hermetic we mock the
 * rate-limit module so no Redis connection is attempted.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { prisma } from "@coldjot/database";
import {
  SequenceStatus,
  BusinessScheduleEnum,
  ProcessingJobEnum,
} from "@coldjot/types";
import {
  SequenceNotFoundError,
  SequenceHasNoStepsError,
  SequenceHasNoContactsError,
  LaunchSequenceServiceImpl,
} from "@/services/domain/launch-sequence.service";
import {
  seedUser,
  seedSequence,
  seedContact,
  seedSequenceStep,
} from "../helpers/seed";

// --- Infra fakes (record calls; no Redis/BullMQ) ---------------------------

const jobManager = {
  sequenceJobs: [] as any[],
  async addSequenceJob(job: any) {
    this.sequenceJobs.push(job);
    return { id: "seq-job-1" };
  },
};

const monitoring = {
  started: [] as string[],
  stopped: [] as string[],
  startMonitoring(id: string) {
    this.started.push(id);
  },
  stopMonitoring(id: string) {
    this.stopped.push(id);
  },
};

const rateLimit = {
  resetCalls: [] as any[],
  async resetLimits(userId: string, sequenceId?: string) {
    this.resetCalls.push({ userId, sequenceId });
  },
};

const service = new LaunchSequenceServiceImpl(
  prisma,
  jobManager as any,
  monitoring as any,
  rateLimit as any
);

const SCOPE = "it-seqlife";
let USER_ID: string;
let SEQ_ID: string;

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  USER_ID = `${SCOPE}-user`;
  SEQ_ID = `${SCOPE}-seq`;
  await seedUser(USER_ID);
  await seedSequence(SEQ_ID, USER_ID, { status: SequenceStatus.DRAFT });
});

beforeEach(async () => {
  jobManager.sequenceJobs = [];
  monitoring.started = [];
  monitoring.stopped = [];
  rateLimit.resetCalls = [];
  await prisma.sequenceStep.deleteMany({ where: { sequenceId: SEQ_ID } });
  await prisma.sequenceContact.deleteMany({ where: { sequenceId: SEQ_ID } });
  await prisma.businessHours.deleteMany({ where: { sequenceId: SEQ_ID } });
  await prisma.sequence.update({
    where: { id: SEQ_ID },
    data: { status: SequenceStatus.DRAFT },
  });
});

describe("sequence lifecycle (LaunchSequenceServiceImpl vs real DB)", () => {
  it("launch sets active, creates default business hours, enqueues the SEQUENCE job, starts monitoring", async () => {
    const contactId = `${SCOPE}-contact`;
    await seedContact(contactId, USER_ID);
    await prisma.sequenceContact.create({
      data: { sequenceId: SEQ_ID, contactId, status: "pending" },
    });
    await seedSequenceStep(`${SCOPE}-step-1`, SEQ_ID, 1);

    const res = await service.launch(SEQ_ID, USER_ID);

    expect(res.stepCount).toBe(1);
    expect(res.contactCount).toBe(1);
    expect(res.jobId).toBe("seq-job-1");

    // Sequence is now active.
    const seq = await prisma.sequence.findUnique({ where: { id: SEQ_ID } });
    expect(seq?.status).toBe(SequenceStatus.ACTIVE);

    // Default business hours were created.
    const bh = await prisma.businessHours.findFirst({ where: { sequenceId: SEQ_ID } });
    expect(bh).not.toBeNull();
    expect(bh!.workDays).toEqual([1, 2, 3, 4, 5]);

    // The SEQUENCE processing job was enqueued with business-hours context.
    expect(jobManager.sequenceJobs).toHaveLength(1);
    expect(jobManager.sequenceJobs[0].type).toBe(ProcessingJobEnum.SEQUENCE);
    expect(jobManager.sequenceJobs[0].scheduleType).toBe(
      BusinessScheduleEnum.BUSINESS
    );

    // Monitoring started.
    expect(monitoring.started).toContain(SEQ_ID);
  });

  it("launch throws SequenceNotFoundError for an unknown sequence", async () => {
    await expect(service.launch("no-such-seq", USER_ID)).rejects.toBeInstanceOf(
      SequenceNotFoundError
    );
  });

  it("launch throws SequenceHasNoStepsError when there are no steps", async () => {
    const contactId = `${SCOPE}-contact-nosteps`;
    await seedContact(contactId, USER_ID);
    await prisma.sequenceContact.create({
      data: { sequenceId: SEQ_ID, contactId, status: "pending" },
    });
    await expect(service.launch(SEQ_ID, USER_ID)).rejects.toBeInstanceOf(
      SequenceHasNoStepsError
    );
  });

  it("launch throws SequenceHasNoContactsError when there are no active contacts", async () => {
    await seedSequenceStep(`${SCOPE}-step-c`, SEQ_ID, 1);
    await expect(service.launch(SEQ_ID, USER_ID)).rejects.toBeInstanceOf(
      SequenceHasNoContactsError
    );
  });

  it("pause + resume toggle status and monitoring", async () => {
    await service.pause(SEQ_ID, USER_ID);
    let seq = await prisma.sequence.findUnique({ where: { id: SEQ_ID } });
    expect(seq?.status).toBe(SequenceStatus.PAUSED);
    expect(monitoring.stopped).toContain(SEQ_ID);

    await service.resume(SEQ_ID, USER_ID);
    seq = await prisma.sequence.findUnique({ where: { id: SEQ_ID } });
    expect(seq?.status).toBe(SequenceStatus.ACTIVE);
  });

  it("pause throws SequenceNotFoundError on a missing sequence", async () => {
    await expect(service.pause("no-such-seq", USER_ID)).rejects.toBeInstanceOf(
      SequenceNotFoundError
    );
  });

  it("reset stops monitoring, resets rate limits, and sets status back to draft", async () => {
    await prisma.sequence.update({
      where: { id: SEQ_ID },
      data: { status: SequenceStatus.ACTIVE, testMode: true, disableSending: true },
    });

    await service.reset(SEQ_ID, USER_ID);

    const seq = await prisma.sequence.findUnique({ where: { id: SEQ_ID } });
    expect(seq?.status).toBe(SequenceStatus.DRAFT);
    expect(seq?.testMode).toBe(false);
    expect(seq?.disableSending).toBe(false);
    expect(monitoring.stopped).toContain(SEQ_ID);
    expect(rateLimit.resetCalls).toHaveLength(1);
  });

  it("reset throws SequenceNotFoundError on a missing sequence", async () => {
    await expect(service.reset("no-such-seq", USER_ID)).rejects.toBeInstanceOf(
      SequenceNotFoundError
    );
  });
});
