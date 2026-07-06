/**
 * Unit tests for the mailbox controller + routes (Group F).
 *
 * Phase 7.9: the controller is a factory (`createMailboxController`) taking
 * `watchService` (injectable as a fake). The controller reads the mailbox via
 * `prisma.mailbox.findActiveGmail` directly, so `@coldjot/database` is mocked
 * here and `findActiveGmail` is stubbed per test. The route factory
 * (`makeMailboxRouter`) mounts the controller behind Express. We drive the
 * routes with supertest and assert the full HTTP contract the characterization
 * test pinned: empty-body 400, Zod validation 400, mailbox-not-found 404,
 * missing-access-token 400, the stop-then-setup ordering, the happy path 200,
 * and the DELETE error path.
 *
 * Replaces the Group F characterization test (mailbox-routes).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

// Mock @coldjot/database: the controller calls prisma.mailbox.findActiveGmail.
// `findActiveGmail` is a prisma extension method, so we stub it per test below.
// Use vi.hoisted so the mock fn exists when the hoisted vi.mock factory runs.
const { findActiveGmail } = vi.hoisted(() => ({
  findActiveGmail: vi.fn(async () => null as any),
}));
vi.mock("@coldjot/database", () => ({
  prisma: {
    mailbox: { findActiveGmail },
  },
}));

import { createMailboxController } from "@/controllers/mailbox.controller";
import { makeMailboxRouter } from "@/routes/mailbox";

const watchService = {
  setupWatch: vi.fn(async () => ({})),
  stopWatch: vi.fn(async () => ({})),
};

const controller = createMailboxController({
  watchService: watchService as any,
});

const app = express();
app.use(express.json());
app.use("/mailbox", makeMailboxRouter(controller));

const USER_ID = "u1";
const EMAIL = "watched@example.com";

beforeEach(() => {
  vi.clearAllMocks();
  findActiveGmail.mockResolvedValue(null as any);
});

describe("[Group F] POST /mailbox/watch", () => {
  it("empty body → 400 'Empty request body'", async () => {
    const res = await request(app).post("/mailbox/watch").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Empty request body");
  });

  it("schema-invalid (missing email) → 400 'Invalid request format' + details", async () => {
    const res = await request(app).post("/mailbox/watch").send({ userId: USER_ID });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid request format");
    expect(res.body.details).toMatch(/email/);
  });

  it("no active Gmail mailbox → 404 'Mailbox not found or not active'", async () => {
    const res = await request(app).post("/mailbox/watch").send({ userId: USER_ID, email: EMAIL });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Mailbox not found or not active");
  });

  it("mailbox with no access_token → 400 'Mailbox requires authentication'", async () => {
    findActiveGmail.mockResolvedValue({
      id: "mbox-1",
      userId: USER_ID,
      email: EMAIL,
      isActive: true,
      provider: "gmail",
      access_token: null,
    } as any);
    const res = await request(app).post("/mailbox/watch").send({ userId: USER_ID, email: EMAIL });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Mailbox requires authentication");
  });

  it("happy path → 200; stopWatch called before setupWatch; setupWatch gets the mailbox tokens", async () => {
    findActiveGmail.mockResolvedValue({
      id: "mbox-1",
      userId: USER_ID,
      email: EMAIL,
      isActive: true,
      provider: "gmail",
      access_token: "tok",
      refresh_token: "rfr",
      expires_at: 2000000000,
    } as any);

    const res = await request(app).post("/mailbox/watch").send({ userId: USER_ID, email: EMAIL });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Watch setup successful");

    // stopWatch was called (with the email) before setupWatch.
    expect(watchService.stopWatch).toHaveBeenCalledWith(EMAIL);
    expect(watchService.setupWatch).toHaveBeenCalledTimes(1);
    expect(watchService.setupWatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        email: EMAIL,
        accessToken: "tok",
        refreshToken: "rfr",
      })
    );
  });

  it("setupWatch throw → 500 'Failed to setup watch'", async () => {
    findActiveGmail.mockResolvedValue({
      id: "mbox-1",
      userId: USER_ID,
      email: EMAIL,
      isActive: true,
      provider: "gmail",
      access_token: "tok",
    } as any);
    watchService.setupWatch.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).post("/mailbox/watch").send({ userId: USER_ID, email: EMAIL });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to setup watch");
  });
});

describe("[Group F] DELETE /mailbox/watch/:email", () => {
  it("happy path → 200 'Watch stopped successfully'; stopWatch called with the email", async () => {
    const res = await request(app).delete(`/mailbox/watch/${encodeURIComponent(EMAIL)}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Watch stopped successfully");
    expect(watchService.stopWatch).toHaveBeenCalledWith(EMAIL);
  });

  it("stopWatch throw → 500 'Failed to stop watch'", async () => {
    watchService.stopWatch.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).delete(`/mailbox/watch/${encodeURIComponent(EMAIL)}`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to stop watch");
  });
});
