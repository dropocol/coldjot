/**
 * Group J — gmail-client characterization tests.
 *
 * Pins the CURRENT behavior of lib/google/gmail/gmail.ts →
 * `GmailClientService.getClient(userId, mailboxId)`.
 *
 * getClient:
 *   1. finds the Mailbox by { id, userId } (throws "Mailbox not found" if missing),
 *   2. validates credentials via validateGmailCredentials,
 *   3. refreshes the access token via refreshTokenIfNeeded,
 *   4. sets credentials on a fresh OAuth2 client,
 *   5. returns `google.gmail({ version: "v1", auth })`.
 *
 * googleapis + the gmail helper are mocked so we characterize the prisma-driven
 * mailbox lookup + credential wiring without touching Google.
 *
 * Source: lib/google/gmail/gmail.ts (lines 24–128).
 */
import { vi } from "vitest";
import { makeFakePrisma, type FakePrisma } from "@/__tests__/helpers/fake-prisma";

// Mock googleapis: capture the auth object handed to google.gmail so we can
// assert it's the same OAuth2 instance whose credentials were set.
const mocks = vi.hoisted(() => ({
  fake: { current: null as FakePrisma | null },
  validateGmailCredentials: vi.fn<(c: any) => void>(() => undefined),
  refreshTokenIfNeeded: vi.fn<(c: any) => Promise<string>>(
    async () => "fresh-access-token"
  ),
  setOAuth2Credentials: vi.fn<(auth: any, token: string, c: any) => void>(
    () => undefined
  ),
  gmailFactory: vi.fn((o: any) => ({ _isGmail: true })) as any,
  OAuth2: vi.fn((...a: any[]) => ({ _isAuth: true })) as any,
}));

vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: mocks.OAuth2 },
    gmail: mocks.gmailFactory,
  },
}));

vi.mock("@/lib/google/gmail/helper", () => ({
  validateGmailCredentials: mocks.validateGmailCredentials,
  refreshTokenIfNeeded: mocks.refreshTokenIfNeeded,
  setOAuth2Credentials: mocks.setOAuth2Credentials,
}));

vi.mock("@coldjot/database", () => ({
  // Lazy proxy so the fake is populated by the time production code reads it.
  prisma: new Proxy(
    {},
    {
      get(_t, prop) {
        if (!mocks.fake.current) throw new Error("fake not initialized");
        return (mocks.fake.current.prisma as any)[prop];
      },
    }
  ),
}));

const fake = makeFakePrisma();
mocks.fake.current = fake;

import { GmailClientService } from "@/lib/google/gmail/gmail";

beforeEach(() => {
  fake.reset();
  mocks.validateGmailCredentials.mockClear();
  mocks.refreshTokenIfNeeded.mockClear();
  mocks.refreshTokenIfNeeded.mockResolvedValue("fresh-access-token");
  mocks.setOAuth2Credentials.mockClear();
  mocks.gmailFactory.mockClear();
  mocks.OAuth2.mockClear();
});

const USER_ID = "usr-1";
const MAILBOX_ID = "mbx-1";

/** Fresh service — bypass the process singleton. */
function makeService() {
  // Reset the static singleton so constructor reads current env.
  (GmailClientService as any).instance = undefined;
  return GmailClientService.getInstance();
}

function seedMailbox(over: Record<string, any> = {}) {
  fake.seed("mailbox", {
    id: MAILBOX_ID,
    userId: USER_ID,
    access_token: "old-access",
    refresh_token: "rfr",
    expires_at: new Date("2020-01-01T00:00:00.000Z"),
    email: "user@coldjot.dev",
    ...over,
  });
}

describe("[Group J] GmailClientService.getClient", () => {
  it("refreshes the token, sets credentials on a new OAuth2 client, returns google.gmail(auth)", async () => {
    seedMailbox();

    const svc = makeService();
    const gmail = await svc.getClient(USER_ID, MAILBOX_ID);

    // Returned the gmail client built by google.gmail({ version, auth }).
    expect(gmail).toMatchObject({ _isGmail: true });
    expect(mocks.gmailFactory).toHaveBeenCalledWith({
      version: "v1",
      auth: expect.objectContaining({ _isAuth: true }),
    });

    // validateGmailCredentials called with the mailbox's credentials.
    expect(mocks.validateGmailCredentials).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        mailboxId: MAILBOX_ID,
        accessToken: "old-access",
        refreshToken: "rfr",
      })
    );

    // refreshTokenIfNeeded called → its return value is the access token handed
    // to setOAuth2Credentials.
    expect(mocks.refreshTokenIfNeeded).toHaveBeenCalledTimes(1);
    expect(mocks.setOAuth2Credentials).toHaveBeenCalledWith(
      expect.objectContaining({ _isAuth: true }),
      "fresh-access-token",
      expect.objectContaining({ userId: USER_ID, mailboxId: MAILBOX_ID })
    );
  });

  it("throws 'Mailbox not found' when no mailbox matches { id, userId }", async () => {
    // No seed → findUnique returns null.
    const svc = makeService();
    await expect(svc.getClient(USER_ID, MAILBOX_ID)).rejects.toThrow(
      /Mailbox not found/
    );
    expect(mocks.refreshTokenIfNeeded).not.toHaveBeenCalled();
    expect(mocks.gmailFactory).not.toHaveBeenCalled();
  });

  it("rethrows when refreshTokenIfNeeded rejects (token refresh failure propagates)", async () => {
    seedMailbox();
    mocks.refreshTokenIfNeeded.mockRejectedValue(new Error("refresh failed"));

    const svc = makeService();
    await expect(svc.getClient(USER_ID, MAILBOX_ID)).rejects.toThrow(
      /refresh failed/
    );
    // setOAuth2Credentials + gmail factory never reached.
    expect(mocks.setOAuth2Credentials).not.toHaveBeenCalled();
    expect(mocks.gmailFactory).not.toHaveBeenCalled();
  });

  it("rethrows when validateGmailCredentials throws (invalid credentials)", async () => {
    seedMailbox();
    mocks.validateGmailCredentials.mockImplementation(() => {
      throw new Error("invalid creds");
    });

    const svc = makeService();
    await expect(svc.getClient(USER_ID, MAILBOX_ID)).rejects.toThrow(
      /invalid creds/
    );
    expect(mocks.refreshTokenIfNeeded).not.toHaveBeenCalled();
  });
});
