/**
 * Unit tests for ScheduleGenerator.calculateNextRun (Group K).
 *
 * Phase 7.3: the schedule generator's core `calculateNextRun(currentTime, step,
 * businessHours)` is effectively pure given the business-hours input — the disk
 * IO (`clearLogFile`) is gated on `isDevelopment` (no-op under NODE_ENV=test),
 * and `Math.random` is stubbed to 0 here so the distribution math is deterministic.
 *
 * With Math.random = 0 the distributions resolve to:
 *   - immediate distribution    → { minutes: 0, seconds: 0, ms: 0 }
 *   - days-unit natural dist    → 60 min
 *   - hours-unit natural dist   → 5 min
 *   - default/adjustment dist   → { minutes: 0, seconds: 0, ms: 0 }
 *
 * This replaces the Group K characterization test (which used the same stub but
 * pulled in the heavy `setupTestContext` harness unnecessarily).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The DELAY path calls `sequenceContactRepo.countScheduledInWindow` (a module-
// level singleton inside lib/schedule) for the rate-limit slot check. Mock the
// Prisma impl so it returns 0 (no slots taken) — isolates the timing math from
// the DB. The characterization test achieved this via the bulk `@coldjot/database`
// mock; we scope it to just the repo method here.
vi.mock("@/repositories/prisma/prisma-sequence-contact.repo", () => ({
  PrismaSequenceContactRepository: class {
    async countScheduledInWindow() {
      return 0;
    }
  },
}));

import { scheduleGenerator } from "@/lib/schedule";
import { TimingType, StepTypeEnum, type BusinessHours } from "@coldjot/types";

beforeEach(() => {
  // Pin randomness so distribution math is deterministic (matches the
  // characterization test's approach).
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const BH: BusinessHours = {
  timezone: "UTC",
  workDays: [1, 2, 3, 4, 5], // Mon–Fri (luxon weekday % 7 mapping)
  workHoursStart: "09:00",
  workHoursEnd: "17:00",
  type: "business" as any,
};

function makeStep(over: Record<string, any> = {}): any {
  return {
    id: "step-1",
    sequenceId: "seq-1",
    stepType: StepTypeEnum.AUTOMATED_EMAIL,
    timing: TimingType.IMMEDIATE,
    delayAmount: null,
    delayUnit: null,
    ...over,
  };
}

/** Tues 2026-07-07 10:00 UTC (within business hours). */
const TUE_NOON = new Date("2026-07-07T10:00:00.000Z");
/** Sat 2026-07-11 10:00 UTC (weekend — outside business hours). */
const SAT = new Date("2026-07-11T10:00:00.000Z");

describe("[Group K] ScheduleGenerator.calculateNextRun — IMMEDIATE timing", () => {
  it("returns ~now during business hours (immediate distribution 0,0,0)", async () => {
    const out = await scheduleGenerator.calculateNextRun(TUE_NOON, makeStep(), BH);
    expect(out.toISOString()).toBe("2026-07-07T10:00:00.000Z");
  });

  it("adjusts to next business-day start when immediate lands on a weekend", async () => {
    const out = await scheduleGenerator.calculateNextRun(SAT, makeStep(), BH);
    // Sat 10:00 → outside BH → next workday Mon 09:00 + bh-dist(60min) = Mon 10:00.
    expect(out.toISOString()).toBe("2026-07-13T10:00:00.000Z");
  });
});

describe("[Group K] ScheduleGenerator.calculateNextRun — DELAY timing", () => {
  it("DELAY 2 hours: base(120) + hours-natural-dist(5) = 125 min added", async () => {
    const out = await scheduleGenerator.calculateNextRun(
      TUE_NOON,
      makeStep({ timing: TimingType.DELAY, delayAmount: 2, delayUnit: "hours" }),
      BH
    );
    expect(out.toISOString()).toBe("2026-07-07T12:05:00.000Z");
  });

  it("DELAY 1 day: base(1440) + days-natural-dist(60) = 1500 min added", async () => {
    const out = await scheduleGenerator.calculateNextRun(
      TUE_NOON,
      makeStep({ timing: TimingType.DELAY, delayAmount: 1, delayUnit: "days" }),
      BH
    );
    expect(out.toISOString()).toBe("2026-07-08T11:00:00.000Z");
  });

  it("WAIT step with hours delay mirrors DELAY math", async () => {
    const out = await scheduleGenerator.calculateNextRun(
      TUE_NOON,
      makeStep({
        stepType: StepTypeEnum.WAIT,
        timing: TimingType.DELAY,
        delayAmount: 1,
        delayUnit: "hours",
      }),
      BH
    );
    expect(out.toISOString()).toBe("2026-07-07T11:05:00.000Z");
  });

  it("falls back to DEFAULT_DELAY (30 min) when delay fields are missing", async () => {
    const out = await scheduleGenerator.calculateNextRun(
      TUE_NOON,
      makeStep({ timing: TimingType.DELAY, delayAmount: null, delayUnit: null }),
      BH
    );
    expect(out.toISOString()).toBe("2026-07-07T10:30:00.000Z");
  });
});

describe("[Group K] ScheduleGenerator.calculateNextRun — timezone handling", () => {
  it("respects a non-UTC business-hours timezone (America/New_York)", async () => {
    // 14:00 UTC = 10:00 EDT (within NY 09:00–17:00 business hours).
    const nyBh: BusinessHours = { ...BH, timezone: "America/New_York" };
    const out = await scheduleGenerator.calculateNextRun(
      new Date("2026-07-07T14:00:00.000Z"),
      makeStep(),
      nyBh
    );
    // 10:00 EDT + 0 = 10:00 EDT = 14:00 UTC.
    expect(out.toISOString()).toBe("2026-07-07T14:00:00.000Z");
  });

  it("treats outside-business-hours as no-work and pushes to the next window", async () => {
    // 23:00 UTC is after 17:00 UTC close → next workday 09:00 + bh-dist(60) = 10:00.
    const out = await scheduleGenerator.calculateNextRun(
      new Date("2026-07-07T23:00:00.000Z"),
      makeStep(),
      BH
    );
    expect(out.toISOString()).toBe("2026-07-08T10:00:00.000Z");
  });
});
