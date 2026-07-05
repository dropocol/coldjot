/**
 * Group D — schedule-processor characterization tests.
 *
 * Pins the CURRENT behavior of services/jobs/schedule/processor.ts →
 * `ScheduleProcessor.processScheduledEmails` (the periodic "tick").
 *
 * The processor extends BaseProcessor (BullMQ Worker/Queue) and depends on
 * ServiceManager → JobManager, rateLimitService, scheduleGenerator, and the
 * updateSequenceContactStatus helper. We mock the infrastructure seams
 * (bullmq, the helper, rate-limit service, schedule generator) so we can
 * characterize the prisma-driven flow:
 *
 *   find due SequenceContacts → for each: rate-limit check → resolve step →
 *   calc next send time → build EmailJob → jobManager.addEmailJob →
 *   mark SCHEDULED + increment counters.
 *
 * Source: services/jobs/schedule/processor.ts (lines 65–654).
 */
import { vi } from "vitest";
import { setupTestContext, wasCalledWith } from "@/__tests__/helpers/test-context";

// ---- mock seams (all hoisted so vi.mock factories can reference them) ---

const NEXT_RUN = new Date("2026-07-07T11:00:00.000Z");

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn<(u: string, s: string, c: string) => Promise<{ allowed: boolean }>>(
    async () => ({ allowed: true })
  ),
  incrementCounters: vi.fn<(u: string, s: string, c: string) => Promise<void>>(
    async () => undefined
  ),
  updateStatus: vi.fn<(...args: any[]) => Promise<void>>(async () => undefined),
  addEmailJob: vi.fn<(job: any) => Promise<void>>(async () => undefined),
  calculateNextRun: vi.fn<(...args: any[]) => Promise<Date>>(
    async () => new Date("2026-07-07T11:00:00.000Z")
  ),
}));

vi.mock("bullmq", () => ({
  Queue: class {
    opts = { connection: {} };
    async upsertJobScheduler() {}
    async add() {}
    async close() {}
  },
  Worker: class {
    on() {}
    close() {}
  },
  Job: class {},
}));

vi.mock("@/lib/schedule", () => ({
  scheduleGenerator: { calculateNextRun: mocks.calculateNextRun },
}));

vi.mock("@/services/core/rate-limit/service", () => ({
  rateLimitService: {
    checkRateLimit: mocks.checkRateLimit,
    incrementCounters: mocks.incrementCounters,
  },
}));

vi.mock("@/services/jobs/sequence/helper", () => ({
  updateSequenceContactStatus: (...args: any[]) => mocks.updateStatus(args),
}));

const ctx = setupTestContext();

import { ScheduleProcessor } from "@/services/jobs/schedule/processor";
import {
  SequenceContactStatusEnum,
  SequenceStatus,
  StepStatus,
  StepTypeEnum,
  StepPriority,
  TimingType,
} from "@coldjot/types";

beforeEach(() => {
  ctx.reset();
  mocks.checkRateLimit.mockClear();
  mocks.incrementCounters.mockClear();
  mocks.updateStatus.mockClear();
  mocks.addEmailJob.mockClear();
  mocks.checkRateLimit.mockResolvedValue({ allowed: true });
});

// ---- fixtures ---------------------------------------------------------

const SEQ_ID = "seq-1";
const CONTACT_ID = "ct-1";
const MAILBOX_ID = "mbx-1";
const USER_ID = "usr-1";
const STEP_ID = "step-1";

/** Build the full sequence+contact graph the processor reads. */
function seedDueContact(over: Record<string, any> = {}) {
  ctx.fake.seed("sequence", {
    id: SEQ_ID,
    userId: USER_ID,
    status: SequenceStatus.ACTIVE,
    testMode: false,
    disableSending: false,
  });
  ctx.fake.seed("sequenceStep", {
    id: STEP_ID,
    sequenceId: SEQ_ID,
    stepType: StepTypeEnum.AUTOMATED_EMAIL,
    priority: StepPriority.NORMAL,
    timing: TimingType.IMMEDIATE,
    delayAmount: null,
    delayUnit: null,
    subject: "Hello",
    content: "<p>hi</p>",
    order: 1,
    replyToThread: false,
  });
  ctx.fake.seed("contact", { id: CONTACT_ID, email: "ada@example.com" });
  ctx.fake.seed(
    "sequenceContact",
    {
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
      status: SequenceContactStatusEnum.IN_PROGRESS,
      // relation selects — the fake attaches these via the select projection:
      // we cheat by also seeding them as nested fields directly on the row.
    },
    ["sequenceId_contactId"]
  );
  // Stash nested relations on the contact row; the fake returns rows as-is.
  const sc = ctx.fake.stores.sequenceContact.rows.get("sc-1")!;
  sc.contact = { id: CONTACT_ID, email: "ada@example.com" };
  sc.sequence = {
    id: SEQ_ID,
    userId: USER_ID,
    status: SequenceStatus.ACTIVE,
    testMode: false,
    disableSending: false,
    sequenceMailbox: { id: MAILBOX_ID },
    steps: [
      {
        id: STEP_ID,
        sequenceId: SEQ_ID,
        stepType: StepTypeEnum.AUTOMATED_EMAIL,
        priority: StepPriority.NORMAL,
        timing: TimingType.IMMEDIATE,
        delayAmount: null,
        delayUnit: null,
        subject: "Hello",
        content: "<p>hi</p>",
        order: 1,
        replyToThread: false,
        status: StepStatus.ACTIVE,
        templateId: null,
      },
    ],
    businessHours: undefined,
  };
  Object.assign(sc, over);
  return sc;
}

/** Construct a processor and invoke the private tick. */
async function runTick(): Promise<void> {
  const queue = new (await import("bullmq")).Queue("q" as any, {} as any);
  // Phase 6.3: JobManager is now constructor-injected. Pass a stub whose
  // addEmailJob is the hoisted mock (assertions check mocks.addEmailJob).
  const jobManager = { addEmailJob: mocks.addEmailJob } as any;
  const p = new ScheduleProcessor(queue as any, jobManager);
  await (p as any).processScheduledEmails();
}

// ------------------------------------------------------------------------
// Happy path
// ------------------------------------------------------------------------

describe("[Group D] processScheduledEmails — happy path", () => {
  it("enqueues an EmailJob, marks SCHEDULED, and increments rate-limit counters", async () => {
    seedDueContact();

    await runTick();

    // EmailJob shape passed to JobManager.
    expect(mocks.addEmailJob).toHaveBeenCalledTimes(1);
    const job = mocks.addEmailJob.mock.calls[0][0]!;
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

    // Status transition: IN_PROGRESS → SCHEDULED.
    expect(mocks.updateStatus).toHaveBeenCalledWith([
      SEQ_ID,
      CONTACT_ID,
      SequenceContactStatusEnum.SCHEDULED,
      expect.any(Object),
    ]);

    // Rate-limit counters incremented once.
    expect(mocks.incrementCounters).toHaveBeenCalledWith(USER_ID, SEQ_ID, CONTACT_ID);
    // mocks.checkRateLimit called once, allowed.
    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(1);
  });

  it("skips contact without enqueuing when rate-limit check returns allowed:false", async () => {
    seedDueContact();
    mocks.checkRateLimit.mockResolvedValue({ allowed: false });

    await runTick();

    expect(mocks.addEmailJob).not.toHaveBeenCalled();
    expect(mocks.updateStatus).not.toHaveBeenCalled();
    expect(mocks.incrementCounters).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------------------
// Step resolution edge cases
// ------------------------------------------------------------------------

describe("[Group D] processScheduledEmails — step edge cases", () => {
  it("throws 'Step not found' when currentStep exceeds steps length AND a step exists in DB", async () => {
    // currentStep=5 but sequence has 1 step; sequenceStep lookup by order=5
    // returns null → processor throws "Step not found" inside the per-email
    // try/catch, which swallows it and continues (logs + continues).
    const sc = seedDueContact({ currentStep: 5 });
    sc.sequence.steps = [sc.sequence.steps[0]]; // only 1 step

    await runTick();

    expect(mocks.addEmailJob).not.toHaveBeenCalled();
    expect(mocks.updateStatus).not.toHaveBeenCalled();
    // No throw escapes — outer per-email catch swallows it.
  });
});

// ------------------------------------------------------------------------
// Empty batch
// ------------------------------------------------------------------------

describe("[Group D] processScheduledEmails — empty batch", () => {
  it("does nothing when no SequenceContacts are due", async () => {
    await runTick();
    expect(mocks.addEmailJob).not.toHaveBeenCalled();
    expect(mocks.updateStatus).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
  });
});
