/**
 * Unit tests for the sequence controller + routes + validators (Group E).
 *
 * Phase 7.9: the controller is a factory (`createSequenceController`) taking a
 * `LaunchSequenceService` — injected as a fake. The route factory
 * (`makeSequenceRouter`) mounts it + the validator middleware behind Express.
 * Driven with supertest to pin the full HTTP contract the characterization test
 * pinned: the userId-required 400s, the typed-error→status mapping
 * (404/400/400 for the three launch errors), the response body shapes, and the
 * happy-path side effects.
 *
 * Replaces the Group E characterization test (sequence-controller). The service-
 * level behavior is covered by unit/services/launch-sequence.service.test.ts +
 * integration/sequence-lifecycle.test.ts; this file covers the HTTP layer only.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import { createSequenceController } from "@/controllers/sequence.controller";
import { makeSequenceRouter } from "@/routes/sequence";
import {
  SequenceNotFoundError,
  SequenceHasNoStepsError,
  SequenceHasNoContactsError,
} from "@/services/domain/launch-sequence.service";

const service = {
  launch: vi.fn(async () => ({ jobId: "job-1", contactCount: 1, stepCount: 1 })),
  pause: vi.fn(async () => ({})),
  resume: vi.fn(async () => ({})),
  reset: vi.fn(async () => ({})),
};

const controller = createSequenceController({ launchSequenceService: service as any });

const app = express();
app.use(express.json());
app.use("/sequence", makeSequenceRouter(controller as any));

const SEQ_ID = "seq-1";
const USER_ID = "u1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("[Group E] validators — userId required", () => {
  it("POST /:id/launch without userId → 400 'User ID is required'", async () => {
    const res = await request(app).post(`/sequence/${SEQ_ID}/launch`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("User ID is required");
    expect(service.launch).not.toHaveBeenCalled();
  });

  it("POST /:id/pause without userId → 400", async () => {
    const res = await request(app).post(`/sequence/${SEQ_ID}/pause`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("User ID is required");
  });

  it("POST /:id/resume without userId → 400", async () => {
    const res = await request(app).post(`/sequence/${SEQ_ID}/resume`).send({});
    expect(res.status).toBe(400);
  });

  it("POST /:id/reset without userId → 400", async () => {
    const res = await request(app).post(`/sequence/${SEQ_ID}/reset`).send({});
    expect(res.status).toBe(400);
  });
});

describe("[Group E] launch — typed-error → HTTP status mapping", () => {
  it("happy path → 200 { success, jobId, contactCount, stepCount }", async () => {
    const res = await request(app)
      .post(`/sequence/${SEQ_ID}/launch`)
      .send({ userId: USER_ID });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, jobId: "job-1", contactCount: 1, stepCount: 1 });
    expect(service.launch).toHaveBeenCalledWith(SEQ_ID, USER_ID);
  });

  it("SequenceNotFoundError → 404 'Sequence not found'", async () => {
    service.launch.mockRejectedValueOnce(new SequenceNotFoundError());
    const res = await request(app).post(`/sequence/${SEQ_ID}/launch`).send({ userId: USER_ID });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Sequence not found");
  });

  it("SequenceHasNoStepsError → 400 'Sequence has no steps'", async () => {
    service.launch.mockRejectedValueOnce(new SequenceHasNoStepsError());
    const res = await request(app).post(`/sequence/${SEQ_ID}/launch`).send({ userId: USER_ID });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Sequence has no steps");
  });

  it("SequenceHasNoContactsError → 400 'Sequence has no active contacts'", async () => {
    service.launch.mockRejectedValueOnce(new SequenceHasNoContactsError());
    const res = await request(app).post(`/sequence/${SEQ_ID}/launch`).send({ userId: USER_ID });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Sequence has no active contacts");
  });

  it("unexpected error → 500 'Failed to launch sequence'", async () => {
    service.launch.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).post(`/sequence/${SEQ_ID}/launch`).send({ userId: USER_ID });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to launch sequence");
  });
});

describe("[Group E] pause / resume / reset", () => {
  it("pause happy → 200 { success: true }", async () => {
    const res = await request(app).post(`/sequence/${SEQ_ID}/pause`).send({ userId: USER_ID });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(service.pause).toHaveBeenCalledWith(SEQ_ID, USER_ID);
  });

  it("pause SequenceNotFoundError → 404", async () => {
    service.pause.mockRejectedValueOnce(new SequenceNotFoundError());
    const res = await request(app).post(`/sequence/${SEQ_ID}/pause`).send({ userId: USER_ID });
    expect(res.status).toBe(404);
  });

  it("resume happy → 200 { success: true }", async () => {
    const res = await request(app).post(`/sequence/${SEQ_ID}/resume`).send({ userId: USER_ID });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(service.resume).toHaveBeenCalledWith(SEQ_ID, USER_ID);
  });

  it("reset happy → 200 { success: true, message: 'Sequence reset successfully' }", async () => {
    const res = await request(app).post(`/sequence/${SEQ_ID}/reset`).send({ userId: USER_ID });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "Sequence reset successfully" });
    expect(service.reset).toHaveBeenCalledWith(SEQ_ID, USER_ID);
  });

  it("reset SequenceNotFoundError → 404", async () => {
    service.reset.mockRejectedValueOnce(new SequenceNotFoundError());
    const res = await request(app).post(`/sequence/${SEQ_ID}/reset`).send({ userId: USER_ID });
    expect(res.status).toBe(404);
  });
});
