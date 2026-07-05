/**
 * Group G — tracking-routes characterization tests.
 *
 * Pins the CURRENT HTTP behavior of routes/tracking/controller.ts, mounted via
 * routes/tracking/index.ts. Mounted on a minimal Express app + supertest.
 *
 * Behaviors pinned:
 *   - GET /:hash: serves the transparent pixel (200) + calls handleEmailOpen;
 *     Gmail compose-view referer → 307 (no tracking); Googlebot UA / googleapis
 *     referer → 200 (no tracking); ".png" suffix stripped.
 *   - GET /:hash/click: missing lid → 400; safe http(s) redirect → 302;
 *     unsafe redirect (javascript:) → 400.
 *   - POST /events: missing fields → 400; invalid event type → 400;
 *     valid event → 200 { success: true }.
 *
 * trackingService is mocked.
 *
 * Source: routes/tracking/controller.ts (lines 1–151).
 */
import { vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handleEmailOpen: vi.fn<(hash: string) => Promise<void>>(async () => undefined),
  handleLinkClick: vi.fn<(hash: string, lid: string) => Promise<string>>(
    async () => "https://safe.example.com/dest"
  ),
  trackEmailEvent: vi.fn<(p: any) => Promise<void>>(async () => undefined),
}));

vi.mock("@/lib/tracking", () => ({
  trackingService: {
    handleEmailOpen: mocks.handleEmailOpen,
    handleLinkClick: mocks.handleLinkClick,
    trackEmailEvent: mocks.trackEmailEvent,
  },
}));

import express from "express";
import request from "supertest";
import trackingRouter from "@/routes/tracking";
import { EmailEventEnum } from "@coldjot/types";

const app = express();
app.use(express.json());
app.use("/t", trackingRouter);

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockClear();
  mocks.handleLinkClick.mockResolvedValue("https://safe.example.com/dest");
});

// ------------------------------------------------------------------------
// Open pixel
// ------------------------------------------------------------------------

describe("[Group G] GET /t/:hash — open pixel", () => {
  it("serves a 200 image/png + records the open via handleEmailOpen", async () => {
    const res = await request(app).get("/t/abc123");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(res.body.length).toBeGreaterThan(0); // pixel bytes
    expect(mocks.handleEmailOpen).toHaveBeenCalledWith("abc123");
  });

  it("strips a trailing .png from the hash before recording", async () => {
    const res = await request(app).get("/t/abc123.png");
    expect(res.status).toBe(200);
    expect(mocks.handleEmailOpen).toHaveBeenCalledWith("abc123");
  });

  it("Gmail compose-view referer → 307, no tracking recorded", async () => {
    const res = await request(app)
      .get("/t/abc123")
      .set("Referer", "https://mail.google.com/mail/u/0/?compose=Crp");
    expect(res.status).toBe(307);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(mocks.handleEmailOpen).not.toHaveBeenCalled();
  });

  it("Googlebot user-agent → 200 image, no tracking recorded", async () => {
    const res = await request(app)
      .get("/t/abc123")
      .set("User-Agent", "Mozilla/5.0 Googlebot/2.1");
    expect(res.status).toBe(200);
    expect(mocks.handleEmailOpen).not.toHaveBeenCalled();
  });

  it("googleapis.com referer → 200 image, no tracking recorded", async () => {
    const res = await request(app)
      .get("/t/abc123")
      .set("Referer", "https://www.googleapis.com/gmail");
    expect(res.status).toBe(200);
    expect(mocks.handleEmailOpen).not.toHaveBeenCalled();
  });

  it("handleEmailOpen throw → 500 JSON error", async () => {
    mocks.handleEmailOpen.mockRejectedValue(new Error("boom"));
    const res = await request(app).get("/t/abc123");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to track email open" });
  });
});

// ------------------------------------------------------------------------
// Click redirect
// ------------------------------------------------------------------------

describe("[Group G] GET /t/:hash/click — link redirect", () => {
  it("missing lid query param → 400 'Link ID is required'", async () => {
    const res = await request(app).get("/t/abc123/click");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Link ID is required" });
  });

  it("safe http(s) redirect → 302 redirect", async () => {
    mocks.handleLinkClick.mockResolvedValue("https://safe.example.com/dest");
    const res = await request(app).get("/t/abc123/click?lid=link-1");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://safe.example.com/dest");
    expect(mocks.handleLinkClick).toHaveBeenCalledWith("abc123", "link-1");
  });

  it("unsafe javascript: redirect → 400 'Invalid redirect target'", async () => {
    mocks.handleLinkClick.mockResolvedValue("javascript:alert(1)");
    const res = await request(app).get("/t/abc123/click?lid=link-1");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid redirect target" });
  });
});

// ------------------------------------------------------------------------
// POST /t/events
// ------------------------------------------------------------------------

describe("[Group G] POST /t/events — event tracking", () => {
  it("missing trackingId/eventType → 400", async () => {
    const res = await request(app).post("/t/events").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Email ID and event type are required/);
  });

  it("invalid event type → 400 'Invalid event type'", async () => {
    const res = await request(app).post("/t/events").send({
      trackingId: "t1",
      eventType: "NOT_A_REAL_EVENT",
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid event type" });
  });

  it("valid event → 200 { success: true } (eventType lowercased)", async () => {
    const res = await request(app).post("/t/events").send({
      trackingId: "t1",
      eventType: EmailEventEnum.SENT,
      metadata: { foo: "bar" },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(mocks.trackEmailEvent).toHaveBeenCalledWith({
      trackingId: "t1",
      eventType: String(EmailEventEnum.SENT).toLowerCase(),
      metadata: { foo: "bar" },
    });
  });
});
