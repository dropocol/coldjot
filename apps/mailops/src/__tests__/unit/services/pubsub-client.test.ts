/**
 * Unit tests for PubSubService push-endpoint reconciliation.
 *
 * Why this file exists: setupSubscription used to no-op when the subscription
 * already existed, so changing PUBSUB_AUDIENCE in env silently left Google
 * pushing to the stale URL. The reconcile branch now compares the live
 * pushConfig to the configured endpoint and calls modifyPushConfig when they
 * differ — making the env var authoritative.
 *
 * Testing shape: PubSubService is a singleton that constructs the @google-cloud/pubsub
 * client in its private constructor, so we mock the module and reset modules per test
 * to get a fresh singleton. Three scenarios over one fake subscription:
 *   1. endpoint differs   → modifyPushConfig called with the env endpoint
 *   2. endpoint matches   → modifyPushConfig NOT called (no-op)
 *   3. subscription absent → createSubscription called (existing behavior, regression guard)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Fake subscription: records calls + lets each test seed getMetadata() ---

const STALE_URL = "https://old-ngrok.ngrok-free.app/api/pubsub";
const NEW_URL = "https://coldjot-dev.test-host/api/pubsub";

/**
 * Build a fresh fake subscription. `existsReturn` and `metadataPushEndpoint`
 * parameterize the two branches setupSubscription keys on.
 */
function makeFakeSubscription(opts: {
  existsReturn: boolean;
  metadataPushEndpoint?: string;
}) {
  const calls: Record<string, any[][]> = {};
  const record = (method: string) => (...args: any[]) => {
    (calls[method] ||= []).push(args);
    return undefined;
  };
  return {
    calls,
    exists: vi.fn().mockResolvedValue([opts.existsReturn]),
    getMetadata: vi.fn().mockResolvedValue([
      {
        name: "projects/test-project/subscriptions/coldjot-subscription",
        pushConfig: { pushEndpoint: opts.metadataPushEndpoint },
      },
    ]),
    modifyPushConfig: vi.fn(record("modifyPushConfig")),
  };
}

// --- Mock @google-cloud/pubsub; `currentFake` lets each test swap the fake ---

let currentFake: ReturnType<typeof makeFakeSubscription> | null = null;

// Stable topic object so the createSubscription spy captured at mock-build
// time is the same instance production calls at runtime (topic() returns the
// same object on every call).
const topicMock = {
  exists: vi.fn().mockResolvedValue([true]),
  subscription: () => currentFake,
  createSubscription: vi.fn().mockResolvedValue([currentFake]),
};

vi.mock("@google-cloud/pubsub", () => {
  return {
    PubSub: vi.fn().mockImplementation(() => ({
      topic: () => topicMock,
    })),
  };
});

// Ensure PubSub is enabled + has dummy creds before each test module import.
// (setup.ts:30 disables it globally; we re-enable per-test here.)
beforeEach(() => {
  vi.resetModules();
  process.env.MAILOPS_PUBSUB_ENABLED = "true";
  process.env.GOOGLE_CLOUD_PROJECT = "test-project";
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "sa@test-project.iam.gserviceaccount.com";
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = "dummy-key";
  process.env.PUBSUB_TOPIC_NAME = "test-topic";
  process.env.PUBSUB_SUBSCRIPTION_NAME = "coldjot-subscription";
  process.env.PUBSUB_AUDIENCE = NEW_URL;
});

describe("PubSubService push-endpoint reconcile", () => {
  it("calls modifyPushConfig when the live endpoint differs from config", async () => {
    currentFake = makeFakeSubscription({
      existsReturn: true, // subscription exists…
      metadataPushEndpoint: STALE_URL, // …pointing at the OLD url → must update
    });

    const { PubSubService } = await import("@/services/pubsub/client");
    const pubsub = PubSubService.getInstance();
    await pubsub.initialize();

    expect(currentFake.calls.modifyPushConfig).toHaveLength(1);
    expect(currentFake!.modifyPushConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        pushEndpoint: NEW_URL,
        oidcToken: {
          serviceAccountEmail: "sa@test-project.iam.gserviceaccount.com",
        },
      })
    );
  });

  it("does NOT call modifyPushConfig when the endpoint already matches", async () => {
    currentFake = makeFakeSubscription({
      existsReturn: true,
      metadataPushEndpoint: NEW_URL, // already correct → no-op
    });

    const { PubSubService } = await import("@/services/pubsub/client");
    const pubsub = PubSubService.getInstance();
    await pubsub.initialize();

    expect(currentFake.calls.modifyPushConfig).toBeUndefined();
  });

  it("creates the subscription (not modify) when it does not exist", async () => {
    currentFake = makeFakeSubscription({
      existsReturn: false, // absent → create path
      metadataPushEndpoint: undefined,
    });
    // Reset the shared createSubscription spy from prior tests.
    topicMock.createSubscription.mockClear();

    const { PubSubService } = await import("@/services/pubsub/client");
    const pubsub = PubSubService.getInstance();
    await pubsub.initialize();

    expect(topicMock.createSubscription).toHaveBeenCalled();
    // modifyPushConfig must not fire on the create path.
    expect(currentFake.calls.modifyPushConfig).toBeUndefined();
  });
});
