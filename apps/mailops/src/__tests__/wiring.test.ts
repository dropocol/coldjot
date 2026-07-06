/**
 * Wiring test — confirms createApp() constructs the full app graph without
 * throwing, and that every slot on the App object is non-null.
 *
 * This test does NOT boot Redis/PubSub (those are started by initializeApp(),
 * which createApp() deliberately does not call). The infra singletons
 * returned are constructed references only.
 */
import { describe, it, expect } from "vitest";
import { createApp } from "@/composition-root";

describe("composition root", () => {
  it("constructs the full app graph without throwing", async () => {
    const app = createApp();

    // Infra singletons (the 4 locked singletons + watch cleanup + clock).
    expect(app.redis).toBeDefined();
    expect(app.redisClient).toBeDefined();
    expect(app.memoryMonitor).toBeDefined();
    expect(app.rateLimit).toBeDefined();
    expect(app.pubsub).toBeDefined();
    expect(app.watchCleanup).toBeDefined();
    expect(app.clock).toBeDefined();
    expect(typeof app.clock.now()).toBe("object"); // Date

    // Jobs infrastructure.
    expect(app.queues).toBeInstanceOf(Map);
    expect(app.queues.size).toBeGreaterThan(0);
    expect(app.dlQueues).toBeInstanceOf(Map);
    expect(app.dlQueues.size).toBeGreaterThan(0);
    expect(app.jobManager).toBeDefined();
    expect(app.processors).toBeInstanceOf(Map);
    expect(app.processors.size).toBeGreaterThan(0);
    expect(app.monitoring).toBeDefined();

    // Domain services.
    expect(app.sendEmail).toBeDefined();
    expect(typeof app.sendEmail.send).toBe("function");
    expect(app.tracking).toBeDefined();
    expect(typeof app.tracking.handleEmailOpen).toBe("function");
    expect(app.inboxSync).toBeDefined();
    expect(typeof app.inboxSync.handleNotification).toBe("function");

  // launchSequence + runSchedule are wired (Phase 7.2a + 7.2b).
  expect(app.launchSequence).toBeDefined();
  expect(typeof app.launchSequence.launch).toBe("function");
  expect(app.runSchedule).toBeDefined();
  expect(typeof app.runSchedule.tick).toBe("function");

    // Controllers (Phase 6.4 factories).
    expect(app.sequenceController).toBeDefined();
    expect(typeof app.sequenceController.launchSequence).toBe("function");
    expect(app.healthController).toBeDefined();
    expect(typeof app.healthController.checkHealth).toBe("function");
    expect(app.metricsController).toBeDefined();
    expect(app.mailboxController).toBeDefined();
    expect(app.listController).toBeDefined();
  });

  it("returns stable infra singletons across calls", () => {
    const a = createApp();
    const b = createApp();
    // Infra singletons are process-wide — same instance on every createApp().
    expect(a.redis).toBe(b.redis);
  });
});

