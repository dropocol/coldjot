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

    // Repositories — every slot wired to a Prisma impl.
    expect(app.emailTracking).toBeDefined();
    expect(app.emailEvent).toBeDefined();
    expect(app.sequenceContact).toBeDefined();
    expect(app.sequence).toBeDefined();
    expect(app.sequenceStep).toBeDefined();
    expect(app.sequenceStats).toBeDefined();
    expect(app.mailbox).toBeDefined();
    expect(app.trackedLink).toBeDefined();
    expect(app.linkClick).toBeDefined();
    expect(app.emailThread).toBeDefined();
    expect(app.emailWatch).toBeDefined();
    expect(app.emailWatchHistory).toBeDefined();
    expect(app.processedMessage).toBeDefined();
    expect(app.businessHours).toBeDefined();
    expect(app.template).toBeDefined();
    expect(app.contact).toBeDefined();
    expect(app.listSyncRecord).toBeDefined();
    expect(app.list).toBeDefined();

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

  it("returns independent repository instances on each call (stateless repos)", () => {
    const a = createApp();
    const b = createApp();
    // Prisma repos are stateless delegators; distinct instances are fine.
    expect(a.emailTracking).not.toBe(b.emailTracking);
    // Infra singletons are process-wide — same instance.
    expect(a.redis).toBe(b.redis);
  });
});

