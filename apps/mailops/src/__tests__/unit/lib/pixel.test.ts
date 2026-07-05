/**
 * Unit tests for the pure tracking-pixel + link-wrap helpers.
 * Target: 100% line coverage on these files.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { generateTrackingPixel } from "@/lib/tracking/pixel";
import {
  wrapLinksWithTracking,
  addTrackingToEmail,
} from "@/lib/tracking/link-wrap";
import type { EmailTracking } from "@coldjot/types";

const PREV_TRACK_API_URL = process.env.TRACK_API_URL;
beforeAll(() => {
  process.env.TRACK_API_URL = "https://track.test";
});
afterAll(() => {
  if (PREV_TRACK_API_URL === undefined) delete process.env.TRACK_API_URL;
  else process.env.TRACK_API_URL = PREV_TRACK_API_URL;
});

describe("generateTrackingPixel", () => {
  it("builds an <img> pointing at the track endpoint for the hash", () => {
    const html = generateTrackingPixel("abc123");
    expect(html).toContain('<img');
    expect(html).toContain('width="1"');
    expect(html).toContain('height="1"');
    expect(html).toContain('style="display:none"');
    expect(html).toContain("https://track.test/api/track/abc123.png");
  });

  it("throws when the hash is empty", () => {
    expect(() => generateTrackingPixel("")).toThrow(/Hash is required/);
  });
});

describe("wrapLinksWithTracking", () => {
  const createLink = async (trackingId: string, url: string) =>
    `link-${trackingId}-${url}`;

  it("rewrites each <a href> to a tracking-redirect URL with lid param", async () => {
    const createLink = vi.fn(async (trackingId: string, url: string) => `lid-${trackingId}-${url}`);
    const content = `<a href="https://example.com/a">A</a> <a href="https://example.com/bb">B</a>`;
    const out = await wrapLinksWithTracking(content, "hash1", "track1", createLink);
    // Both hrefs rewritten to the tracking URL; lid is URL-encoded into the query.
    expect(out).toContain(`lid=lid-track1-${encodeURIComponent("https://example.com/a")}`);
    expect(out).toContain(`lid=lid-track1-${encodeURIComponent("https://example.com/bb")}`);
    expect(out).toContain("/api/track/hash1/click");
    // createLink called once per href.
    expect(createLink).toHaveBeenCalledTimes(2);
    // Original hrefs gone.
    expect(out).not.toContain('href="https://example.com/a"');
  });

  it("ignores empty hrefs", async () => {
    const content = `<a href="">empty</a><a href="https://x.example">x</a>`;
    const out = await wrapLinksWithTracking(content, "h", "t", createLink);
    expect(out).toContain("lid=");
    // The empty-href anchor is left untouched.
    expect(out).toContain('href=""');
  });

  it("throws when content, hash, or trackingId is missing", async () => {
    await expect(wrapLinksWithTracking("", "h", "t", createLink)).rejects.toThrow(/required/);
    await expect(wrapLinksWithTracking("c", "", "t", createLink)).rejects.toThrow(/required/);
    await expect(wrapLinksWithTracking("c", "h", "", createLink)).rejects.toThrow(/required/);
  });
});

describe("addTrackingToEmail", () => {
  const baseTracking = {
    hash: "h1",
    id: "track1",
    metadata: { email: "dest@example.com" },
    pixel: generateTrackingPixel("h1"),
    wrappedLinks: true,
  } as unknown as EmailTracking;

  it("appends the pixel and rewrites links when wrappedLinks is on", async () => {
    const content = `<a href="https://example.com">x</a>`;
    const out = await addTrackingToEmail(content, baseTracking, async () => "lid-1");
    expect(out).toContain("/api/track/h1/click");
    expect(out.endsWith(baseTracking.pixel)).toBe(true);
  });

  it("skips link wrapping but still appends pixel when wrappedLinks is off", async () => {
    const tracking = { ...baseTracking, wrappedLinks: false } as unknown as EmailTracking;
    const content = `<a href="https://example.com">x</a>`;
    const out = await addTrackingToEmail(content, tracking, async () => "lid-1");
    expect(out).not.toContain("/api/track/h1/click");
    expect(out).toContain(baseTracking.pixel);
  });

  it("throws when content or tracking is missing", async () => {
    await expect(addTrackingToEmail("", baseTracking, async () => "x")).rejects.toThrow(
      /Content and tracking information are required/
    );
    await expect(
      addTrackingToEmail("c", null as any, async () => "x")
    ).rejects.toThrow(/Content and tracking information are required/);
  });
});
