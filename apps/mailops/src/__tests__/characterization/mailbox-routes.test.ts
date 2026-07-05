/**
 * Group F — mailbox-routes characterization tests.
 *
 * Pins the CURRENT HTTP behavior of routes/mailbox.ts (POST /watch,
 * DELETE /watch/:email). Mounted on a minimal Express app + supertest.
 *
 * Behaviors pinned:
 *   - POST /watch: empty body → 400, schema-invalid → 400 with details,
 *     no active Gmail mailbox → 404, mailbox missing access_token → 400,
 *     happy path stops-then-sets-up watch → 200.
 *   - DELETE /watch/:email: stops the watch, 200; missing email param → 400.
 *
 * WatchService is mocked; the prisma-driven mailbox lookup is the surface
 * under test.
 *
 * Source: routes/mailbox.ts (lines 1–128).
 */
import { vi } from "vitest";
import { setupTestContext } from "@/__tests__/helpers/test-context";

const mocks = vi.hoisted(() => ({
  setupWatch: vi.fn<(p: any) => Promise<void>>(async () => undefined),
  stopWatch: vi.fn<(email: string) => Promise<void>>(async () => undefined),
}));

vi.mock("@/services/watch", () => ({
  // The route file imports from "../services/watch" which resolves to the
  // index → default-exports WatchService. Match the named export shape.
  WatchService: class {
    setupWatch = mocks.setupWatch;
    stopWatch = mocks.stopWatch;
  },
}));

const ctx = setupTestContext();

import express from "express";
import request from "supertest";
import { makeMailboxRouter } from "@/routes/mailbox";
import { createMailboxController } from "@/controllers/mailbox.controller";
import { WatchService } from "@/services/watch";
import { PrismaMailboxRepository } from "@/repositories/prisma/prisma-mailbox.repo";

// Phase 6.4: routes are factories. Construct the controller with the mocked
// WatchService (vi.mock above) + the fake-backed PrismaMailboxRepository.
const mailboxController = createMailboxController({
  watchService: new WatchService(),
  mailboxRepo: new PrismaMailboxRepository(),
});
const mailboxRouter = makeMailboxRouter(mailboxController);

const app = express();
app.use(express.json());
app.use("/mailbox", mailboxRouter);

beforeEach(() => {
  ctx.reset();
  mocks.setupWatch.mockClear();
  mocks.stopWatch.mockClear();
});

const USER_ID = "usr-1";
const EMAIL = "ada@coldjot.dev";

function seedMailbox(over: Record<string, any> = {}) {
  ctx.fake.seed("mailbox", {
    id: "mbx-1",
    userId: USER_ID,
    email: EMAIL,
    isActive: true,
    provider: "gmail",
    access_token: "tok",
    refresh_token: "rfr",
    expires_at: new Date("2026-01-01T00:00:00.000Z"),
    ...over,
  });
}

describe("[Group F] POST /mailbox/watch", () => {
  it("empty body → 400 'Empty request body'", async () => {
    const res = await request(app).post("/mailbox/watch").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Empty request body");
  });

  it("schema-invalid (missing email) → 400 'Invalid request format'", async () => {
    const res = await request(app)
      .post("/mailbox/watch")
      .send({ userId: USER_ID }); // no email
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid request format");
    expect(res.body.details).toMatch(/email/);
  });

  it("no active Gmail mailbox → 404", async () => {
    const res = await request(app)
      .post("/mailbox/watch")
      .send({ userId: USER_ID, email: EMAIL });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Mailbox not found or not active");
  });

  it("mailbox missing access_token → 400 'Mailbox requires authentication'", async () => {
    seedMailbox({ access_token: null });
    const res = await request(app)
      .post("/mailbox/watch")
      .send({ userId: USER_ID, email: EMAIL });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Mailbox requires authentication");
  });

  it("happy path: stops existing watch then sets up a new one, returns 200", async () => {
    seedMailbox();
    const res = await request(app)
      .post("/mailbox/watch")
      .send({ userId: USER_ID, email: EMAIL });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Watch setup successful" });
    // stopWatch called first, then setupWatch.
    expect(mocks.stopWatch).toHaveBeenCalledWith(EMAIL);
    expect(mocks.setupWatch).toHaveBeenCalledTimes(1);
    const params = mocks.setupWatch.mock.calls[0][0];
    expect(params).toMatchObject({
      userId: USER_ID,
      email: EMAIL,
      accessToken: "tok",
      refreshToken: "rfr",
    });
  });
});

describe("[Group F] DELETE /mailbox/watch/:email", () => {
  it("stops the watch and returns 200", async () => {
    const res = await request(app).delete(`/mailbox/watch/${encodeURIComponent(EMAIL)}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Watch stopped successfully" });
    expect(mocks.stopWatch).toHaveBeenCalledWith(EMAIL);
  });

  it("returns 500 when stopWatch throws", async () => {
    mocks.stopWatch.mockRejectedValue(new Error("boom"));
    const res = await request(app).delete(`/mailbox/watch/${encodeURIComponent(EMAIL)}`);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to stop watch" });
  });
});
