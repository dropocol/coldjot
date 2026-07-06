/**
 * Unit tests for GmailClientService.getClient (Group J).
 *
 * Phase 7.2: `GmailClientService` builds the OAuth2 client + google.gmail
 * handle internally, so googleapis + the gmail helper are mocked (same as the
 * characterization test). The mailbox lookup now goes through the
 * `FakeMailboxRepository` injected via the class's overridable field (Phase 6.3
 * already made the repo overridable for tests).
 *
 * Covers: token refresh + credential wiring, "Mailbox not found", and refresh-
 * failure propagation. Replaces the Group J characterization test.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  validateGmailCredentials: vi.fn(() => undefined),
  refreshTokenIfNeeded: vi.fn(async () => "fresh-access-token"),
  setOAuth2Credentials: vi.fn((_auth: any, _token: string, _c: any) => undefined),
  gmailFactory: vi.fn((_o: any) => ({ _isGmail: true })) as any,
  OAuth2: vi.fn((..._a: any[]) => ({ _isAuth: true })) as any,
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

import { GmailClientService } from "@/lib/google/gmail/gmail";
import { FakeMailboxRepository } from "@/__tests__/helpers/fakes/inbox-sync-repos.fake";

const USER_ID = "usr-1";
const MAILBOX_ID = "mbx-1";

function makeService(mailboxRepo: FakeMailboxRepository) {
  const svc = new GmailClientService();
  // Phase 6.3 made the repo overridable; reach in for the test.
  (svc as any).mailboxRepo = mailboxRepo;
  return svc;
}

function seedMailbox(repo: FakeMailboxRepository, over: Record<string, any> = {}) {
  repo.store.set(MAILBOX_ID, {
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
  } as any);
  Object.assign(repo.store.get(MAILBOX_ID)!, over);
}

beforeEach(() => {
  mocks.validateGmailCredentials.mockClear();
  mocks.refreshTokenIfNeeded.mockClear();
  mocks.refreshTokenIfNeeded.mockResolvedValue("fresh-access-token");
  mocks.setOAuth2Credentials.mockClear();
  mocks.gmailFactory.mockClear();
  mocks.OAuth2.mockClear();
});

describe("[Group J] GmailClientService.getClient", () => {
  it("refreshes the token, sets credentials on a new OAuth2 client, returns google.gmail(auth)", async () => {
    const repo = new FakeMailboxRepository();
    seedMailbox(repo);
    const svc = makeService(repo);

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
    const repo = new FakeMailboxRepository();
    const svc = makeService(repo);

    await expect(svc.getClient(USER_ID, MAILBOX_ID)).rejects.toThrow(
      "Mailbox not found"
    );
  });

  it("propagates a token-refresh failure", async () => {
    const repo = new FakeMailboxRepository();
    seedMailbox(repo);
    mocks.refreshTokenIfNeeded.mockRejectedValue(new Error("refresh failed"));
    const svc = makeService(repo);

    await expect(svc.getClient(USER_ID, MAILBOX_ID)).rejects.toThrow(
      "refresh failed"
    );
  });
});
