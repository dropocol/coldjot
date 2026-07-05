/**
 * Group E — sequence-controller characterization tests.
 *
 * Pins the CURRENT HTTP behavior of routes/sequence/controller.ts, mounted via
 * routes/sequence/index.ts. We mount just the sequence router on a minimal
 * Express app and exercise each endpoint with supertest.
 *
 * Behaviors pinned:
 *   - validator: missing userId → 400 "User ID is required"
 *   - launch: 404 "Sequence not found", 400 "Sequence has no steps",
 *     400 "Sequence has no active contacts", happy path → 200 { success, jobId,
 *     contactCount, stepCount }
 *   - pause: 404 + happy → 200 { success }
 *   - resume: 404 + happy → 200 { success }
 *   - reset: 404 + happy → 200 { success, message }
 *
 * ServiceManager / MonitoringService / rateLimitService / resetSequence are
 * mocked so we characterize the prisma-driven HTTP contract only.
 *
 * Source: routes/sequence/controller.ts (lines 1–274), validator.ts (1–54).
 */
import { vi } from "vitest";
import { setupTestContext } from "@/__tests__/helpers/test-context";

const mocks = vi.hoisted(() => ({
  addSequenceJob: vi.fn<(job: any) => Promise<{ id: string }>>(
    async () => ({ id: "job-1" })
  ),
  startMonitoring: vi.fn<(id: string) => Promise<void>>(async () => undefined),
  stopMonitoring: vi.fn<(id: string) => Promise<void>>(async () => undefined),
  resetLimits: vi.fn<(u: string, s: string) => Promise<void>>(
    async () => undefined
  ),
  resetSequence: vi.fn<(id: string) => Promise<void>>(async () => undefined),
}));

vi.mock("@/services/service-manager", () => ({
  ServiceManager: class {
    static getInstance() {
      return { getJobManager: () => ({ addSequenceJob: mocks.addSequenceJob }) };
    }
  },
}));

vi.mock("@/services/monitor/service", () => ({
  MonitoringService: class {
    constructor() {}
    startMonitoring = mocks.startMonitoring;
    stopMonitoring = mocks.stopMonitoring;
  },
}));

vi.mock("@/services/core/rate-limit/service", () => ({
  rateLimitService: { resetLimits: mocks.resetLimits },
}));

vi.mock("@/services/jobs/sequence/helper", () => ({
  resetSequence: mocks.resetSequence,
}));

const ctx = setupTestContext();

import express from "express";
import request from "supertest";
import seqRouter from "@/routes/sequence";

const app = express();
app.use(express.json());
app.use("/sequences", seqRouter);

beforeEach(() => {
  ctx.reset();
  for (const m of Object.values(mocks)) m.mockClear();
});

const SEQ_ID = "seq-1";
const USER_ID = "usr-1";

function seedSequence(over: Record<string, any> = {}) {
  ctx.fake.seed("sequence", {
    id: SEQ_ID,
    userId: USER_ID,
    status: "draft",
    testMode: false,
    disableSending: false,
    steps: [{ id: "s1", order: 1 }],
    contacts: [{ id: "c1", status: "pending", contact: { id: "ct-1" } }],
    ...over,
  });
}

// ------------------------------------------------------------------------
// Validation
// ------------------------------------------------------------------------

describe("[Group E] sequence controller — validation", () => {
  it("POST /:id/launch with no userId → 400 'User ID is required'", async () => {
    const res = await request(app).post(`/sequences/${SEQ_ID}/launch`).send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "User ID is required" });
  });
});

// ------------------------------------------------------------------------
// Launch
// ------------------------------------------------------------------------

describe("[Group E] sequence controller — launch", () => {
  it("returns 404 'Sequence not found' when sequence missing", async () => {
    const res = await request(app)
      .post(`/sequences/${SEQ_ID}/launch`)
      .send({ userId: USER_ID });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Sequence not found" });
  });

  it("returns 400 'Sequence has no steps'", async () => {
    seedSequence({ steps: [], contacts: [{ id: "c1" }] });
    const res = await request(app)
      .post(`/sequences/${SEQ_ID}/launch`)
      .send({ userId: USER_ID });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Sequence has no steps" });
  });

  it("returns 400 'Sequence has no active contacts'", async () => {
    seedSequence({ steps: [{ id: "s1" }], contacts: [] });
    const res = await request(app)
      .post(`/sequences/${SEQ_ID}/launch`)
      .send({ userId: USER_ID });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Sequence has no active contacts" });
  });

  it("happy path: enqueues job, starts monitoring, returns 200 with counts", async () => {
    seedSequence();
    const res = await request(app)
      .post(`/sequences/${SEQ_ID}/launch`)
      .send({ userId: USER_ID });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      jobId: "job-1",
      contactCount: 1,
      stepCount: 1,
    });
    expect(mocks.addSequenceJob).toHaveBeenCalledTimes(1);
    expect(mocks.startMonitoring).toHaveBeenCalledWith(SEQ_ID);
    // sequence status set to active
    expect(ctx.fake.stores.sequence.rows.get(SEQ_ID)!.status).toBe("active");
  });
});

// ------------------------------------------------------------------------
// Pause / Resume
// ------------------------------------------------------------------------

describe("[Group E] sequence controller — pause/resume", () => {
  it("pause: 404 when missing", async () => {
    const res = await request(app)
      .post(`/sequences/${SEQ_ID}/pause`)
      .send({ userId: USER_ID });
    expect(res.status).toBe(404);
  });

  it("pause: sets status 'paused' + stops monitoring, returns 200", async () => {
    seedSequence();
    const res = await request(app)
      .post(`/sequences/${SEQ_ID}/pause`)
      .send({ userId: USER_ID });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(ctx.fake.stores.sequence.rows.get(SEQ_ID)!.status).toBe("paused");
    expect(mocks.stopMonitoring).toHaveBeenCalledWith(SEQ_ID);
  });

  it("resume: sets status 'active' + starts monitoring, returns 200", async () => {
    seedSequence({ status: "paused" });
    const res = await request(app)
      .post(`/sequences/${SEQ_ID}/resume`)
      .send({ userId: USER_ID });
    expect(res.status).toBe(200);
    expect(ctx.fake.stores.sequence.rows.get(SEQ_ID)!.status).toBe("active");
    expect(mocks.startMonitoring).toHaveBeenCalledWith(SEQ_ID);
  });
});

// ------------------------------------------------------------------------
// Reset
// ------------------------------------------------------------------------

describe("[Group E] sequence controller — reset", () => {
  it("returns 404 when sequence missing", async () => {
    const res = await request(app)
      .post(`/sequences/${SEQ_ID}/reset`)
      .send({ userId: USER_ID });
    expect(res.status).toBe(404);
  });

  it("resets to draft, clears testMode/disableSending, resets rate limits, returns 200", async () => {
    seedSequence({ status: "active", testMode: true, disableSending: true });
    const res = await request(app)
      .post(`/sequences/${SEQ_ID}/reset`)
      .send({ userId: USER_ID });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: "Sequence reset successfully",
    });
    const seq = ctx.fake.stores.sequence.rows.get(SEQ_ID)!;
    expect(seq.status).toBe("draft");
    expect(seq.testMode).toBe(false);
    expect(seq.disableSending).toBe(false);
    expect(mocks.stopMonitoring).toHaveBeenCalledWith(SEQ_ID);
    expect(mocks.resetLimits).toHaveBeenCalledWith(USER_ID, SEQ_ID);
    expect(mocks.resetSequence).toHaveBeenCalledWith(SEQ_ID);
  });
});
