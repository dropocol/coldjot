/**
 * Unit tests for RunScheduleServiceImpl.tick(). The service owns the full
 * schedule loop; we inject fakes for the repos + JobManager + rate-limit +
 * schedule generator, and mock the updateSequenceContactStatus helper import.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the helper's updateSequenceContactStatus (function import in the service).
const updateStatusMock = vi.hoisted(() => vi.fn<(args: any[]) => Promise<void>>(async () => undefined));
vi.mock("@/services/jobs/sequence/helper", () => ({
  updateSequenceContactStatus: (...args: any[]) => updateStatusMock(args),
  resetSequence: vi.fn(async () => undefined),
}));

import { RunScheduleServiceImpl } from "@/services/domain/run-schedule.service";
import {
  FakeSequenceContactRepository,
  FakeSequenceStepRepository,
  FakeJobManager,
  FakeRateLimitService,
} from "@/__tests__/helpers/fakes";
import type { DueContactGraph } from "@/repositories/sequence-contact.repo";
import {
  SequenceContactStatusEnum,
  SequenceStatus,
  StepTypeEnum,
} from "@coldjot/types";

const SEQ_ID = "seq-1";
const CONTACT_ID = "ct-1";
const MAILBOX_ID = "mbx-1";
const USER_ID = "u1";
const STEP_ID = "step-1";
const NEXT_RUN = new Date("2026-07-07T11:00:00.000Z");

let sequenceContact: FakeSequenceContactRepository;
let sequenceStep: FakeSequenceStepRepository;
let jobManager: FakeJobManager;
let rateLimit: FakeRateLimitService;
let scheduleGen: { calculateNextRun: ReturnType<typeof vi.fn> };
let service: RunScheduleServiceImpl;

beforeEach(() => {
  sequenceContact = new FakeSequenceContactRepository();
  sequenceStep = new FakeSequenceStepRepository();
  jobManager = new FakeJobManager();
  rateLimit = new FakeRateLimitService();
  scheduleGen = { calculateNextRun: vi.fn(async () => NEXT_RUN) };
  service = new RunScheduleServiceImpl(
    sequenceContact,
    sequenceStep,
    jobManager as any,
    rateLimit,
    scheduleGen as any
  );
  updateStatusMock.mockClear();
});

function seedDue(over: Partial<DueContactGraph> = {}): DueContactGraph {
  const base: DueContactGraph = {
    id: "sc-1",
    sequenceId: SEQ_ID,
    contactId: CONTACT_ID,
    currentStep: 1,
    lastProcessedAt: null,
    nextScheduledAt: new Date("2020-01-01T00:00:00.000Z"),
    completed: false,
    completedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    failureCount: 0,
    sequence: {
      id: SEQ_ID,
      userId: USER_ID,
      status: SequenceStatus.ACTIVE,
      testMode: false,
      disableSending: false,
      sequenceMailboxId: MAILBOX_ID,
      steps: [
        {
          id: STEP_ID,
          order: 1,
          stepType: StepTypeEnum.AUTOMATED_EMAIL,
          timing: "IMMEDIATE",
          delayAmount: null,
          delayUnit: null,
          subject: "Hi",
          content: "<p>hi</p>",
          includeSignature: null,
          note: null,
          previousStepId: null,
          replyToThread: false,
          templateId: null,
        },
      ],
    },
    contact: { id: CONTACT_ID, email: "ada@example.com" },
  };
  const merged = { ...base, ...over } as DueContactGraph;
  sequenceContact.dueRows.push(merged);
  return merged;
}

describe("tick — happy path", () => {
  it("enqueues an EmailJob, marks SCHEDULED, increments counters", async () => {
    seedDue();
    const out = await service.tick();
    expect(out.enqueued).toBe(1);
    expect(jobManager.emailJobs).toHaveLength(1);
    const job = jobManager.emailJobs[0];
    expect(job).toMatchObject({
      sequenceId: SEQ_ID,
      contactId: CONTACT_ID,
      stepId: STEP_ID,
      userId: USER_ID,
      to: "ada@example.com",
      sequenceMailboxId: MAILBOX_ID,
      threadId: undefined,
      disableSending: false,
      testMode: false,
    });
    expect(job.scheduledTime).toBe(NEXT_RUN.toISOString());
    expect(updateStatusMock).toHaveBeenCalledWith([
      SEQ_ID,
      CONTACT_ID,
      SequenceContactStatusEnum.SCHEDULED,
      expect.any(Object),
    ]);
    expect(rateLimit.incrementCalls).toContainEqual({
      userId: USER_ID,
      sequenceId: SEQ_ID,
      contactId: CONTACT_ID,
    });
  });
});

describe("tick — rate-limit skip", () => {
  it("skips a contact when checkRateLimit returns allowed:false", async () => {
    seedDue();
    rateLimit.allowed = false;
    const out = await service.tick();
    expect(out.enqueued).toBe(0);
    expect(jobManager.emailJobs).toHaveLength(0);
    expect(updateStatusMock).not.toHaveBeenCalled();
    expect(rateLimit.incrementCalls).toHaveLength(0);
  });
});

describe("tick — empty batch", () => {
  it("enqueues nothing when no contacts are due", async () => {
    const out = await service.tick();
    expect(out.enqueued).toBe(0);
    expect(rateLimit.checkCalls).toHaveLength(0);
  });
});

describe("tick — step edge cases", () => {
  it("missing step + step deleted in DB → no-op (no throw escapes)", async () => {
    // currentStep beyond the steps array; findBySequenceAndOrder returns null.
    seedDue({ currentStep: 9 });
    sequenceStep.store.set("alt", {
      id: "alt",
      sequenceId: SEQ_ID,
      order: 1,
      stepType: StepTypeEnum.AUTOMATED_EMAIL,
      timing: "IMMEDIATE",
      delayAmount: null,
      delayUnit: null,
      subject: null,
      content: null,
      includeSignature: null,
      note: null,
      previousStepId: null,
      replyToThread: false,
      templateId: null,
    });
    // No step at order 9 in the repo → handleMissingStep treats it as deleted.
    const out = await service.tick();
    expect(out.enqueued).toBe(0);
    expect(jobManager.emailJobs).toHaveLength(0);
  });
});

describe("tick — bounded retry on failure", () => {
  it("when calculateNextRun returns null, the contact is retried (failureCount bumped); tick resolves", async () => {
    // processEmail re-throws after the bounded-retry update, but tick()'s
    // per-contact catch swallows it (logs + continues) — so tick resolves
    // with enqueued: 0. The failure is visible on the SequenceContact row.
    seedDue();
    scheduleGen.calculateNextRun.mockResolvedValue(null);
    const out = await service.tick();
    expect(out.enqueued).toBe(0);
    // The service updated the contact row with a bumped failureCount + backoff.
    const updateByIdCall = sequenceContact.calls.find((c) => c.method === "updateById");
    expect(updateByIdCall).toBeDefined();
    const updateArg = updateByIdCall!.args[1] as Record<string, unknown>;
    expect(updateArg).toMatchObject({ failureCount: 1 });
    expect(updateArg.nextScheduledAt).toBeInstanceOf(Date);
    expect(updateArg.lastError).toMatch(/Could not calculate next send time/);
  });
});
