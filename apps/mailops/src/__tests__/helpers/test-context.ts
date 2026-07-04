/**
 * Shared test context — wires the fakes into the production modules via
 * vi.mock so each test file only needs to:
 *   1. import { setupTestContext } from "@/__tests__/helpers/test-context";
 *   2. const ctx = setupTestContext();
 *   3. (in beforeEach) ctx.reset();
 *
 * vi.mock factories are hoisted above other imports, but they ARE allowed to
 * reference other (non-mocked) imported modules. The fake-prisma and
 * fake-gmail modules don't depend on @coldjot/database or @/lib/google, so
 * importing them at the top of THIS file is safe.
 *
 * The one constraint: the mocked modules (@coldjot/database, @/lib/google,
 * @/lib/stats) must read state lazily, because setupTestContext() is called
 * by the test file AFTER this module finishes initializing. We use a
 * module-level `holder` that starts null and is populated by
 * setupTestContext().
 */
import { vi, type Mock } from "vitest";
import { makeFakePrisma, type FakePrisma } from "./fake-prisma";
import { makeFakeGmail, type GmailResponses, type FakeGmail } from "./fake-gmail";

export interface TestContext {
  fake: FakePrisma;
  gmailResponses: GmailResponses;
  fakeGmail: FakeGmail;
  /** Spy on updateSequenceStats. */
  stats: Mock;
  /** The mocked prisma module (same object as ctx.fake.prisma). */
  prisma: any;
  /** Reset all in-memory state + recorded calls. Call in beforeEach. */
  reset: () => void;
}

// Hoisted holder — populated by setupTestContext() at test-file load time.
// Stays null only between the mock hoist and setupTestContext() running.
const holder = vi.hoisted(() => ({
  fake: null as FakePrisma | null,
  gmailResponses: {} as GmailResponses,
  fakeGmailHolder: { current: null as FakeGmail | null },
  stats: vi.fn(async () => ({})) as Mock,
  // Token-refresh mock return value (used by PubSub handler tests).
  refreshTokenResult: "fake-access-token" as string | null,
}));

// A lazy prisma proxy so vi.mock("@coldjot/database") can return an object
// that resolves to holder.fake.prisma once setupTestContext() has run.
const lazyPrisma = new Proxy(
  {},
  {
    get(_t, prop) {
      if (!holder.fake) {
        throw new Error(
          "test-context: prisma accessed before setupTestContext() — call setupTestContext() at the top of the test file."
        );
      }
      return (holder.fake.prisma as any)[prop];
    },
  }
);

vi.mock("@coldjot/database", () => ({ prisma: lazyPrisma }));
vi.mock("@/lib/google", () => ({
  gmailClientService: {
    async getClient(_userId: string, _mailboxId: string) {
      // Build a fresh fake gmail from current response overrides each call.
      holder.fakeGmailHolder.current = makeFakeGmail(holder.gmailResponses);
      return holder.fakeGmailHolder.current.gmail;
    },
  },
  sendGmailSMTP: vi.fn(async () => ({ messageId: "smtp-1", threadId: "smtp-thr-1" })),
}));

// Mock the gmail helper so PubSubHandler's token-refresh + thread-info
// calls don't hit the real Google API. Tests can override via
// ctx.setRefreshTokenResult(...).
holder.refreshTokenResult = "fake-access-token";
vi.mock("@/lib/google/gmail/helper", () => ({
  refreshTokenIfNeeded: vi.fn(async () => holder.refreshTokenResult),
  setOAuth2Credentials: vi.fn(),
  validateGmailCredentials: vi.fn(),
  getEmailThreadInfo: vi.fn(async () => ({ threadHeaders: { messageId: "<t@test>" } })),
}));
vi.mock("@/lib/stats", () => ({ updateSequenceStats: holder.stats }));

/**
 * MUST be called once at the top of each test file, BEFORE any import of the
 * production code under test.
 */
export function setupTestContext(): TestContext {
  if (!holder.fake) {
    holder.fake = makeFakePrisma();
    holder.fakeGmailHolder.current = makeFakeGmail(holder.gmailResponses);
  }
  return {
    get fake() {
      return holder.fake!;
    },
    gmailResponses: holder.gmailResponses,
    get fakeGmail() {
      return holder.fakeGmailHolder.current!;
    },
    stats: holder.stats,
    prisma: lazyPrisma,
    reset() {
      holder.fake!.reset();
      for (const k of Object.keys(holder.gmailResponses)) {
        delete (holder.gmailResponses as any)[k];
      }
      holder.fakeGmailHolder.current = makeFakeGmail(holder.gmailResponses);
      holder.stats.mockClear();
    },
  };
}

/** Convenience: assert a recorded prisma call matches a partial shape. */
export function wasCalledWith(
  ctx: TestContext,
  model: string,
  op: string,
  partial: Record<string, any>
): boolean {
  return ctx.fake.calls.some(
    (c) => c.model === model && c.op === op && deepIncludes(c.args, partial)
  );
}

function deepIncludes(haystack: any, needle: any): boolean {
  if (needle === null || typeof needle !== "object") return haystack === needle;
  if (typeof haystack !== "object" || haystack === null) return false;
  for (const [k, v] of Object.entries(needle)) {
    if (!deepIncludes(haystack[k], v)) return false;
  }
  return true;
}
