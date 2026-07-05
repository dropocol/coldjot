/**
 * Phase 1 wiring test — confirms createApp() constructs the full app graph
 * without throwing, and that every slot on the App object is non-null.
 *
 * This test does NOT boot Redis/PubSub (those are lazily started by
 * ServiceManager.initialize(), which createApp() deliberately does not call).
 * The infra singletons returned are constructed references only.
 */
import { describe, it, expect } from "vitest";
import { createApp } from "@/composition-root";

describe("composition root", () => {
  it("constructs the full app graph without throwing", async () => {
    const app = createApp();

    // Infra singletons.
    expect(app.redis).toBeDefined();
    expect(app.memoryMonitor).toBeDefined();
    expect(app.rateLimit).toBeDefined();
    expect(app.pubsub).toBeDefined();
    expect(app.watchCleanup).toBeDefined();
    expect(app.jobManager).toBeDefined();
    expect(app.serviceManager).toBeDefined();
    expect(app.clock).toBeDefined();
    expect(typeof app.clock.now()).toBe("object"); // Date

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

    // launchSequence + runSchedule exist but are deliberately not-yet-wired
    // (Phase 2/4 fills them). They should reject on call.
    expect(app.launchSequence).toBeDefined();
    expect(app.runSchedule).toBeDefined();
    await expect(app.runSchedule.tick()).rejects.toThrow(/not wired/);
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
