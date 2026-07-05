/**
 * Unit tests for LaunchSequenceServiceImpl. The service throws typed domain
 * errors; we assert against the error classes (the controller maps them to
 * HTTP — that's covered by the Group E characterization test).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// resetSequence is a function import in the service; mock it so it doesn't
// touch the prisma-backed helper.
vi.mock("@/services/jobs/sequence/helper", () => ({
  resetSequence: vi.fn(async () => undefined),
}));

import { LaunchSequenceServiceImpl } from "@/services/domain/launch-sequence.service";
import {
  SequenceNotFoundError,
  SequenceHasNoStepsError,
  SequenceHasNoContactsError,
} from "@/services/domain/launch-sequence.service";
import {
  FakeSequenceRepository,
  FakeBusinessHoursRepository,
  FakeJobManager,
  FakeRateLimitService,
} from "@/__tests__/helpers/fakes";
import { BusinessScheduleEnum } from "@coldjot/types";

const SEQ_ID = "seq-1";
const USER_ID = "u1";

let sequenceRepo: FakeSequenceRepository;
let businessHoursRepo: FakeBusinessHoursRepository;
let jobManager: FakeJobManager;
let rateLimit: FakeRateLimitService;
let monitoring: { startMonitoring: ReturnType<typeof vi.fn>; stopMonitoring: ReturnType<typeof vi.fn> };
let service: LaunchSequenceServiceImpl;

beforeEach(() => {
  sequenceRepo = new FakeSequenceRepository();
  businessHoursRepo = new FakeBusinessHoursRepository();
  jobManager = new FakeJobManager();
  rateLimit = new FakeRateLimitService();
  monitoring = {
    startMonitoring: vi.fn(async () => undefined),
    stopMonitoring: vi.fn(() => undefined),
  };
  service = new LaunchSequenceServiceImpl(
    sequenceRepo,
    businessHoursRepo,
    jobManager as any,
    monitoring as any,
    rateLimit
  );
});

function seedSequence(over: any = {}) {
  sequenceRepo.store.set(SEQ_ID, {
    id: SEQ_ID,
    userId: USER_ID,
    status: "draft",
    testMode: false,
    disableSending: false,
    steps: [{ id: "s1", order: 1 }],
    contacts: [{ id: "c1", contactId: "ct-1", status: "pending", contact: { id: "ct-1", email: "" } }],
    businessHours: null,
    ...over,
  });
}

describe("launch", () => {
  it("happy path: sets status active, enqueues the SEQUENCE job, starts monitoring", async () => {
    seedSequence();
    const out = await service.launch(SEQ_ID, USER_ID);
    expect(out).toEqual({ jobId: "job-1", contactCount: 1, stepCount: 1 });
    expect(sequenceRepo.store.get(SEQ_ID)?.status).toBe("active");
    expect(jobManager.sequenceJobs).toHaveLength(1);
    expect(jobManager.sequenceJobs[0].sequenceId).toBe(SEQ_ID);
    expect(monitoring.startMonitoring).toHaveBeenCalledWith(SEQ_ID);
  });

  it("creates default business hours when none exist", async () => {
    seedSequence();
    await service.launch(SEQ_ID, USER_ID);
    expect(businessHoursRepo.calls.some((c) => c.method === "createForSequence")).toBe(true);
  });

  it("throws SequenceNotFoundError when the sequence is missing", async () => {
    await expect(service.launch("nope", USER_ID)).rejects.toBeInstanceOf(
      SequenceNotFoundError
    );
  });

  it("throws SequenceHasNoStepsError when there are no steps", async () => {
    seedSequence({ steps: [] });
    await expect(service.launch(SEQ_ID, USER_ID)).rejects.toBeInstanceOf(
      SequenceHasNoStepsError
    );
  });

  it("throws SequenceHasNoContactsError when there are no active contacts", async () => {
    seedSequence({ contacts: [] });
    await expect(service.launch(SEQ_ID, USER_ID)).rejects.toBeInstanceOf(
      SequenceHasNoContactsError
    );
  });
});

describe("pause / resume", () => {
  it("pause sets status 'paused' + stops monitoring", async () => {
    seedSequence({ status: "active" });
    await service.pause(SEQ_ID, USER_ID);
    expect(sequenceRepo.store.get(SEQ_ID)?.status).toBe("paused");
    expect(monitoring.stopMonitoring).toHaveBeenCalledWith(SEQ_ID);
  });

  it("resume sets status 'active' + starts monitoring", async () => {
    seedSequence({ status: "paused" });
    await service.resume(SEQ_ID, USER_ID);
    expect(sequenceRepo.store.get(SEQ_ID)?.status).toBe("active");
    expect(monitoring.startMonitoring).toHaveBeenCalledWith(SEQ_ID);
  });

  it("pause throws SequenceNotFoundError on a missing sequence", async () => {
    await expect(service.pause("nope", USER_ID)).rejects.toBeInstanceOf(
      SequenceNotFoundError
    );
  });
});

describe("reset", () => {
  it("stops monitoring, resets rate limits, calls resetSequence, resets to draft", async () => {
    seedSequence({ status: "active", testMode: true, disableSending: true });
    await service.reset(SEQ_ID, USER_ID);
    expect(monitoring.stopMonitoring).toHaveBeenCalledWith(SEQ_ID);
    expect(rateLimit.resetCalls).toContainEqual({ userId: USER_ID, sequenceId: SEQ_ID, contactId: undefined });
    const { resetSequence } = await import("@/services/jobs/sequence/helper");
    expect(resetSequence).toHaveBeenCalledWith(SEQ_ID);
    const row = sequenceRepo.store.get(SEQ_ID)!;
    expect(row.status).toBe("draft");
  });

  it("throws SequenceNotFoundError on a missing sequence", async () => {
    await expect(service.reset("nope", USER_ID)).rejects.toBeInstanceOf(
      SequenceNotFoundError
    );
  });
});
