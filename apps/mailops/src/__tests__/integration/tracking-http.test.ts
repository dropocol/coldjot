/**
 * Integration test — tracking HTTP routes (pixel + click redirect + events).
 *
 * Phase 7.7 flow 11 (Group G): the tracking controller's HTTP contract — pixel
 * served with the right headers, Gmail compose/reply views skipped, Googlebot
 * skipped, click redirect honored, unsafe redirect targets blocked, and invalid
 * event types rejected. Uses supertest against the real Express router.
 *
 * The controller reaches `trackingService` via the `@/lib/tracking` module
 * singleton; we mock it so this test exercises the HTTP layer's contract (the
 * DB writes are covered by the send-and-track flow). This replaces Phase 0's
 * Group G characterization test.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import express from "express";

// vi.mock factories are hoisted above imports, so the mock fns must be declared
// with vi.hoisted to be in scope inside the factory.
const mocks = vi.hoisted(() => ({
  handleEmailOpen: vi.fn(async () => ({})),
  handleLinkClick: vi.fn(async () => "https://example.com/dest"),
  trackEmailEvent: vi.fn(async () => ({})),
}));

vi.mock("@/lib/tracking", () => ({
  trackingService: {
    handleEmailOpen: mocks.handleEmailOpen,
    handleLinkClick: mocks.handleLinkClick,
    trackEmailEvent: mocks.trackEmailEvent,
  },
}));

const { handleEmailOpen, handleLinkClick, trackEmailEvent } = mocks;

import trackingRouter from "@/routes/tracking";

const app = express();
app.use(express.json());
app.use("/t", trackingRouter);

describe("tracking HTTP routes", () => {
  beforeAll(() => {
    handleEmailOpen.mockClear();
    handleLinkClick.mockClear();
    trackEmailEvent.mockClear();
  });

  it("GET /:hash serves a 1x1 transparent PNG with no-tracking headers", async () => {
    const res = await request(app)
      .get("/t/some-hash")
      .set("User-Agent", "Mozilla/5.0 Browser");
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toBe("image/png");
    expect(res.header["x-robots-tag"]).toBe("noindex, nofollow");
    expect(res.header["x-frame-options"]).toBe("deny");
    expect(handleEmailOpen).toHaveBeenCalledWith("some-hash");
  });

  it("GET /:hash.png strips the .png suffix before tracking", async () => {
    handleEmailOpen.mockClear();
    const res = await request(app)
      .get("/t/abc.png")
      .set("User-Agent", "Mozilla/5.0");
    expect(res.status).toBe(200);
    expect(handleEmailOpen).toHaveBeenCalledWith("abc");
  });

  it("GET /:hash from a Gmail compose/reply referer skips tracking (307)", async () => {
    handleEmailOpen.mockClear();
    const res = await request(app)
      .get("/t/compose-hash")
      .set("Referer", "https://mail.google.com/mail/u/0/?compose=Crsp");
    expect(res.status).toBe(307);
    expect(handleEmailOpen).not.toHaveBeenCalled();
  });

  it("GET /:hash from Googlebot skips tracking (200, no tracking call)", async () => {
    handleEmailOpen.mockClear();
    const res = await request(app)
      .get("/t/bot-hash")
      .set("User-Agent", "Googlebot/2.1");
    expect(res.status).toBe(200);
    expect(handleEmailOpen).not.toHaveBeenCalled();
  });

  it("GET /:hash/click redirects to the tracked link's destination", async () => {
    const res = await request(app)
      .get("/t/some-hash/click?lid=link-1")
      .set("User-Agent", "Mozilla/5.0");
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(handleLinkClick).toHaveBeenCalledWith("some-hash", "link-1");
  });

  it("GET /:hash/click without a lid returns 400", async () => {
    const res = await request(app).get("/t/some-hash/click");
    expect(res.status).toBe(400);
  });

  it("GET /:hash/click blocks an unsafe redirect target (javascript:)", async () => {
    handleLinkClick.mockResolvedValueOnce("javascript:alert(1)");
    const res = await request(app)
      .get("/t/unsafe/click?lid=x")
      .set("User-Agent", "Mozilla/5.0");
    expect(res.status).toBe(400);
  });

  it("POST /events rejects an invalid event type with 400", async () => {
    const res = await request(app)
      .post("/t/events")
      .send({ trackingId: "trk-1", eventType: "MALICIOUS" });
    expect(res.status).toBe(400);
    expect(trackEmailEvent).not.toHaveBeenCalled();
  });

  it("POST /events rejects a request missing trackingId/eventType", async () => {
    const res = await request(app).post("/t/events").send({});
    expect(res.status).toBe(400);
  });

  it("POST /events accepts a valid event type and records it", async () => {
    trackEmailEvent.mockClear();
    const res = await request(app)
      .post("/t/events")
      .send({ trackingId: "trk-1", eventType: "opened" });
    expect(res.status).toBe(200);
    expect(trackEmailEvent).toHaveBeenCalled();
  });

  // ---- Group G gap coverage (ported from the characterization suite) -------
  // These pin the exact contracts the characterization test asserted and the
  // original permanent suite only checked loosely: exact status codes, error
  // bodies, the Location header, the googleapis.com referer branch, the
  // open-pixel 500 path, and the events arg-shape (lowercasing + metadata).

  it("GET /:hash with a googleapis.com referer skips tracking (200, no call)", async () => {
    handleEmailOpen.mockClear();
    const res = await request(app)
      .get("/t/api-hash")
      .set("Referer", "https://www.googleapis.com/gmail/v1")
      .set("User-Agent", "Mozilla/5.0");
    expect(res.status).toBe(200);
    expect(handleEmailOpen).not.toHaveBeenCalled();
  });

  it("GET /:hash returns a 500 JSON error when handleEmailOpen throws", async () => {
    handleEmailOpen.mockRejectedValueOnce(new Error("db down"));
    const res = await request(app)
      .get("/t/err-hash")
      .set("User-Agent", "Mozilla/5.0");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to track email open" });
  });

  it("GET /:hash serves a non-empty pixel body", async () => {
    const res = await request(app)
      .get("/t/body-hash")
      .set("User-Agent", "Mozilla/5.0");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("GET /:hash/click with a safe https target returns 302 + the Location header", async () => {
    handleLinkClick.mockResolvedValueOnce("https://safe.example.com/dest");
    const res = await request(app)
      .get("/t/safe/click?lid=link-1")
      .set("User-Agent", "Mozilla/5.0");
    expect(res.status).toBe(302);
    expect(res.header.location).toBe("https://safe.example.com/dest");
  });

  it("GET /:hash/click with a missing lid returns the exact error body", async () => {
    const res = await request(app).get("/t/x/click");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Link ID is required" });
  });

  it("GET /:hash/click with an unsafe target returns the exact error body", async () => {
    handleLinkClick.mockResolvedValueOnce("javascript:alert(1)");
    const res = await request(app)
      .get("/t/unsafe2/click?lid=x")
      .set("User-Agent", "Mozilla/5.0");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid redirect target" });
  });

  it("POST /events lowercases the eventType + passes metadata through", async () => {
    trackEmailEvent.mockClear();
    const res = await request(app)
      .post("/t/events")
      .send({
        trackingId: "trk-1",
        eventType: "OPENED",
        metadata: { ip: "1.2.3.4" },
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(trackEmailEvent).toHaveBeenCalledWith({
      trackingId: "trk-1",
      eventType: "opened",
      metadata: { ip: "1.2.3.4" },
    });
  });

  it("POST /events missing fields returns the exact error body", async () => {
    const res = await request(app).post("/t/events").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Email ID and event type are required/);
  });

  it("POST /events invalid type returns the exact error body", async () => {
    const res = await request(app)
      .post("/t/events")
      .send({ trackingId: "trk-1", eventType: "MALICIOUS" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid event type" });
  });
});
