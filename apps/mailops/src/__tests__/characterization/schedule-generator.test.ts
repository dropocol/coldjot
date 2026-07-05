/**
 * Group K — schedule-generator characterization tests.
 *
 * Pins the CURRENT behavior of lib/schedule/index.ts →
 * `ScheduleGenerator.calculateNextRun` (singleton instance `scheduleGenerator`).
 *
 * `calculateDistribution` (lib/schedule/helper.ts) uses Math.random heavily,
 * so we stub `Math.random` → 0 to make outputs deterministic. With that stub:
 *   - immediate distribution    → { minutes: 0, seconds: 0, ms: 0 }
 *   - days-unit natural dist    → 60 min (1h*60 + 0)
 *   - hours-unit natural dist   → 5 min
 *   - default/adjustment dist   → { minutes: 0, seconds: 0, ms: 0 }
 *
 * Source: lib/schedule/index.ts (lines 35–473), helper.ts (lines 159–386).
 */
import { setupTestContext } from "@/__tests__/helpers/test-context";

const ctx = setupTestContext();

import { scheduleGenerator } from "@/lib/schedule";
import { TimingType, StepTypeEnum, type BusinessHours } from "@coldjot/types";

beforeEach(() => {
  ctx.reset();
  // Pin randomness so distribution math is deterministic.
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

// ------------------------------------------------------------------------
// Immediate timing
// ------------------------------------------------------------------------

describe("[Group K] calculateNextRun — IMMEDIATE timing", () => {
  it("adds the immediate distribution (0,0,0 with Math.random=0) and returns ~now during business hours", async () => {
    const out = await scheduleGenerator.calculateNextRun(TUE_NOON, makeStep(), BH);
    // 10:00 + 0 min = 10:00 (within BH → no adjustment)
    expect(out.toISOString()).toBe("2026-07-07T10:00:00.000Z");
  });

  it("adjusts to next business-day start when immediate lands on a weekend", async () => {
    const out = await scheduleGenerator.calculateNextRun(SAT, makeStep(), BH);
    // Sat 10:00 + 0min = Sat 10:00 (outside BH) → adjustToBusinessHours
    // → next workday Mon 09:00 + business-hours distribution(60min,0,0) = Mon 10:00.
    expect(out.toISOString()).toBe("2026-07-13T10:00:00.000Z");
  });
});

// ------------------------------------------------------------------------
// Delayed timing
// ------------------------------------------------------------------------

describe("[Group K] calculateNextRun — DELAY timing", () => {
  it("DELAY 2 hours: base(120) + hours-natural-dist(5) = 125 min added", async () => {
    const out = await scheduleGenerator.calculateNextRun(
      TUE_NOON,
      makeStep({
        timing: TimingType.DELAY,
        delayAmount: 2,
        delayUnit: "hours",
      }),
      BH
    );
    // 10:00 + 125min = 12:05 (within BH → no further adjustment)
    expect(out.toISOString()).toBe("2026-07-07T12:05:00.000Z");
  });

  it("DELAY 1 day: base(1440) + days-natural-dist(60) = 1500 min added", async () => {
    const out = await scheduleGenerator.calculateNextRun(
      TUE_NOON,
      makeStep({
        timing: TimingType.DELAY,
        delayAmount: 1,
        delayUnit: "days",
      }),
      BH
    );
    // 10:00 + 1500min = 35:00 → next day 11:00 (within BH)
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
    // 10:00 + (60 + 5) = 11:05
    expect(out.toISOString()).toBe("2026-07-07T11:05:00.000Z");
  });

  it("falls back to DEFAULT_DELAY (30 min) when delay fields are missing", async () => {
    const out = await scheduleGenerator.calculateNextRun(
      TUE_NOON,
      makeStep({ timing: TimingType.DELAY, delayAmount: null, delayUnit: null }),
      BH
    );
    // No delayAmount/Unit → delay = DEFAULT_DELAY = 30 (no natural dist branch).
    // 10:00 + 30 = 10:30 (within BH).
    expect(out.toISOString()).toBe("2026-07-07T10:30:00.000Z");
  });
});
