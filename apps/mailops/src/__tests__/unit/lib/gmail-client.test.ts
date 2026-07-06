/**
 * Unit tests for GmailClientService.getClient (Group J).
 *
 * mailops v2: `GmailClientService` calls `prisma.mailbox.findByIdForUser`
 * directly (via the domain extension). Mock `@coldjot/database` with an
 * in-memory mailbox store so the test stays DB-free.
 *
 * Covers: token refresh + credential wiring, "Mailbox not found", and refresh-
 * failure propagation.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  validateGmailCredentials: vi.fn(() => undefined),
  refreshTokenIfNeeded: vi.fn(async () => "fresh-access-token"),
  setOAuth2Credentials: vi.fn((_auth: any, _token: string, _c: any) => undefined),
  gmailFactory: vi.fn((_o: any) => ({ _isGmail: true })) as any,
  OAuth2: vi.fn((..._a: any[]) => ({ _isAuth: true })) as any,
  mailboxStore: new Map<string, any>(),
  findByIdForUser: vi.fn(async (id: string) =>
    mocks.mailboxStore.get(id) ?? null
  ),
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
  prisma: {
    mailbox: {
      findByIdForUser: mocks.findByIdForUser,
    },
  },
}));

import { GmailClientService } from "@/lib/google/gmail/gmail";

const USER_ID = "usr-1";
const MAILBOX_ID = "mbx-1";

function seedMailbox(over: Record<string, any> = {}) {
  mocks.mailboxStore.set(MAILBOX_ID, {
    id: MAILBOX_ID,
    userId: USER_ID,
    email: "user@example.com",
    access_token: "old-access",
    refresh_token: "rfr",
    expires_at: 1577836800,
    providerAccountId: "acct",
    provider: "gmail",
    isActive: true,
    name: null,
    ...over,
  });
}

beforeEach(() => {
  mocks.mailboxStore.clear();
  mocks.validateGmailCredentials.mockClear();
  mocks.refreshTokenIfNeeded.mockClear();
  mocks.refreshTokenIfNeeded.mockResolvedValue("fresh-access-token");
  mocks.setOAuth2Credentials.mockClear();
  mocks.gmailFactory.mockClear();
  mocks.OAuth2.mockClear();
  mocks.findByIdForUser.mockClear();
  mocks.findByIdForUser.mockImplementation(async (id: string) =>
    mocks.mailboxStore.get(id) ?? null
  );
});

describe("[Group J] GmailClientService.getClient", () => {
  it("refreshes the token, sets credentials on a new OAuth2 client, returns google.gmail(auth)", async () => {
    seedMailbox();
    const svc = new GmailClientService();

    const gmail = await svc.getClient(USER_ID, MAILBOX_ID);

    // A fresh OAuth2 client was constructed.
    expect(mocks.OAuth2).toHaveBeenCalled();
    // Credentials were validated + token refreshed + set on the auth object.
    expect(mocks.validateGmailCredentials).toHaveBeenCalled();
    expect(mocks.refreshTokenIfNeeded).toHaveBeenCalled();
    expect(mocks.setOAuth2Credentials).toHaveBeenCalledWith(
      expect.any(Object),
      "fresh-access-token",
      expect.objectContaining({ userId: USER_ID, mailboxId: MAILBOX_ID })
    );
    // google.gmail was called with that auth → returned the gmail handle.
    expect(mocks.gmailFactory).toHaveBeenCalledWith(
      expect.objectContaining({ version: "v1" })
    );
    expect((gmail as any)._isGmail).toBe(true);
  });

  it('throws "Mailbox not found" when the mailbox is absent', async () => {
    const svc = new GmailClientService();

    await expect(svc.getClient(USER_ID, MAILBOX_ID)).rejects.toThrow(
      "Mailbox not found"
    );
  });

  it("propagates a token-refresh failure", async () => {
    seedMailbox();
    mocks.refreshTokenIfNeeded.mockRejectedValue(new Error("refresh failed"));
    const svc = new GmailClientService();

    await expect(svc.getClient(USER_ID, MAILBOX_ID)).rejects.toThrow(
      "refresh failed"
    );
  });
});
