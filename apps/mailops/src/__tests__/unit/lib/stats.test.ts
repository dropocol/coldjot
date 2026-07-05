/**
 * Unit tests for the pure rate-math helper. Ports the assertions from the
 * deleted Phase 0 Group B rate-math canary so the math stays pinned.
 */
import { describe, it, expect } from "vitest";
import { calculateRates } from "@/lib/tracking/stats";

describe("calculateRates", () => {
  it("returns 0 for all rates when no emails sent", () => {
    const r = calculateRates({
      totalEmails: 0,
      sentEmails: 0,
      openedEmails: 0,
      clickedEmails: 0,
      repliedEmails: 0,
      bouncedEmails: 0,
    });
    expect(r).toEqual({ openRate: 0, clickRate: 0, replyRate: 0, bounceRate: 0 });
  });

  it("treats null counts as 0 (defensive)", () => {
    const r = calculateRates({
      totalEmails: null,
      sentEmails: null,
      openedEmails: null,
      clickedEmails: null,
      repliedEmails: null,
      bouncedEmails: null,
    });
    expect(r).toEqual({ openRate: 0, clickRate: 0, replyRate: 0, bounceRate: 0 });
  });

  it("uses max(sentEmails + 1, 1) as denominator (the pinned formula)", () => {
    // sentEmails=10 → denominator 11. openedEmails=5 → openRate = 5/11*100 ≈ 45.45
    const r = calculateRates({
      totalEmails: 10,
      sentEmails: 10,
      openedEmails: 5,
      clickedEmails: 2,
      repliedEmails: 1,
      bouncedEmails: 0,
    });
    expect(r.openRate).toBeCloseTo((5 / 11) * 100, 5);
    expect(r.clickRate).toBeCloseTo((2 / 11) * 100, 5);
    expect(r.replyRate).toBeCloseTo((1 / 11) * 100, 5);
    expect(r.bounceRate).toBe(0);
  });

  it("handles sentEmails = 1 (denominator = 2)", () => {
    const r = calculateRates({
      totalEmails: 1,
      sentEmails: 1,
      openedEmails: 1,
      clickedEmails: 1,
      repliedEmails: 1,
      bouncedEmails: 1,
    });
    // denominator = max(1+1, 1) = 2; each = 1/2*100 = 50
    expect(r.openRate).toBe(50);
    expect(r.clickRate).toBe(50);
    expect(r.replyRate).toBe(50);
    expect(r.bounceRate).toBe(50);
  });
});
