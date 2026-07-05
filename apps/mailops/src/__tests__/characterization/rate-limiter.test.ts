/**
 * Group N — rate-limiter characterization tests.
 *
 * Pins the CURRENT behavior of lib/rate-limiter.ts → `RateLimiter`.
 * In-memory token bucket with two windows (per-second + per-minute). The
 * `acquire()` loop busy-waits on a 50ms timer when either counter is at its
 * cap, and resets the counters when the floor(Date.now()/window) advances.
 *
 * Uses vi.useFakeTimers because acquire() busy-waits on setTimeout(50).
 *
 * Source: lib/rate-limiter.ts (lines 1–62).
 */
import {
  RateLimiter,
} from "@/lib/rate-limiter";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Advance real microtasks so `await setTimeout` chains resolve. */
async function flush() {
  // Let pending timers + microtasks settle. Multiple rounds because acquire()
  // re-checks after each 50ms tick.
  for (let i = 0; i < 50; i++) {
    await Promise.resolve();
    vi.advanceTimersByTime(50);
    await Promise.resolve();
  }
}

describe("[Group N] RateLimiter", () => {
  it("allows up to maxPerSecond acquires in the same second", async () => {
    vi.setSystemTime(new Date("2026-07-07T10:00:00.000Z"));
    const rl = new RateLimiter({ maxPerSecond: 3, maxPerMinute: 100 });

    // Three acquires under the per-second cap should all resolve without any
    // timer advancement.
    let count = 0;
    await Promise.all([
      rl.acquire().then(() => count++),
      rl.acquire().then(() => count++),
      rl.acquire().then(() => count++),
    ]);
    expect(count).toBe(3);
  });

  it("blocks the (maxPerSecond+1)th acquire in the same second, then unblocks next second", async () => {
    vi.setSystemTime(new Date("2026-07-07T10:00:00.000Z"));
    const rl = new RateLimiter({ maxPerSecond: 2, maxPerMinute: 100 });

    // First two resolve immediately.
    await rl.acquire();
    await rl.acquire();

    // Third should be blocked.
    let thirdResolved = false;
    const third = rl.acquire().then(() => {
      thirdResolved = true;
    });

    // Flush one 50ms tick — still same second, still blocked.
    await Promise.resolve();
    vi.advanceTimersByTime(50);
    await Promise.resolve();
    expect(thirdResolved).toBe(false);

    // Advance into the next second → counter resets → third resolves.
    vi.setSystemTime(new Date("2026-07-07T10:00:01.000Z"));
    await flush();
    expect(thirdResolved).toBe(true);
    void third;
  });

  it("resets the minute counter when the minute rolls over", async () => {
    vi.setSystemTime(new Date("2026-07-07T10:00:00.000Z"));
    const rl = new RateLimiter({ maxPerSecond: 100, maxPerMinute: 2 });

    // Consume both minute tokens.
    await rl.acquire();
    await rl.acquire();

    // Third is blocked by the minute cap.
    let resolved = false;
    const p = rl.acquire().then(() => {
      resolved = true;
    });

    await Promise.resolve();
    vi.advanceTimersByTime(100);
    await Promise.resolve();
    expect(resolved).toBe(false);

    // Roll over to the next minute.
    vi.setSystemTime(new Date("2026-07-07T10:01:00.000Z"));
    await flush();
    expect(resolved).toBe(true);
    void p;
  });

  it("release() is a no-op (counters are time-based, not token-based)", () => {
    vi.setSystemTime(new Date("2026-07-07T10:00:00.000Z"));
    const rl = new RateLimiter({ maxPerSecond: 1, maxPerMinute: 1 });
    // Just shouldn't throw and shouldn't change observable acquire semantics.
    expect(() => rl.release()).not.toThrow();
  });
});
