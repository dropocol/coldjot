/**
 * Adapter tests for GmailInboxSource — replays synthetic Gmail REST responses
 * (history.list + messages.get shapes) against the adapter and asserts it maps
 * them into the InboxSource domain shapes.
 *
 * Global `fetch` is stubbed; `refreshTokenIfNeeded` is mocked. No live Gmail.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const refreshToken = vi.hoisted(() => vi.fn<(m: any) => Promise<string | null>>(async () => "fresh-token"));
vi.mock("@/lib/google/gmail/helper", () => ({
  refreshTokenIfNeeded: (m: any) => refreshToken(m),
}));

import { GmailInboxSource } from "@/adapters/gmail-inbox-source";
import type { MailboxTokenRef, FetchMessageInput } from "@/adapters/inbox-source";

let fetchMock: ReturnType<typeof vi.fn>;
let source: GmailInboxSource;

beforeEach(() => {
  source = new GmailInboxSource();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  refreshToken.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const okJson = (body: any) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  json: async () => body,
  text: async () => "",
});

// ---- getValidAccessToken --------------------------------------------------

describe("GmailInboxSource.getValidAccessToken", () => {
  it("delegates to refreshTokenIfNeeded with the mailbox fields", async () => {
    refreshToken.mockResolvedValue("refreshed-token");
    const mailbox: MailboxTokenRef = {
      id: "mb1",
      userId: "u1",
      accessToken: "old",
      refreshToken: "rt",
      expiryDate: 123,
    };
    const out = await source.getValidAccessToken(mailbox);
    expect(out).toBe("refreshed-token");
    expect(refreshToken).toHaveBeenCalledWith({
      mailboxId: "mb1",
      userId: "u1",
      accessToken: "old",
      refreshToken: "rt",
      expiryDate: 123,
    });
  });

  it("returns null when refresh fails", async () => {
    refreshToken.mockResolvedValue(null);
    const out = await source.getValidAccessToken({
      id: "mb1", userId: "u1", accessToken: "old", refreshToken: "rt", expiryDate: 0,
    });
    expect(out).toBeNull();
  });
});

// ---- fetchHistory ---------------------------------------------------------

describe("GmailInboxSource.fetchHistory", () => {
  it("returns the parsed history payload on a 200", async () => {
    const payload = { history: [{ id: "h1" }], historyId: "9999" };
    fetchMock.mockResolvedValueOnce(okJson(payload));
    const out = await source.fetchHistory({ startHistoryId: "1000", accessToken: "tok" });
    expect(out).toEqual(payload);
    // fetch called with the Gmail history URL + bearer token.
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("startHistoryId=1000");
    expect((init as any).headers.Authorization).toBe("Bearer tok");
  });

  it("throws when the response is not ok", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, statusText: "Unauthorized" });
    await expect(
      source.fetchHistory({ startHistoryId: "1", accessToken: "tok" })
    ).rejects.toThrow(/Failed to fetch history/);
  });
});

// ---- fetchMessage ---------------------------------------------------------

const msgInput = (over: Partial<FetchMessageInput> = {}): FetchMessageInput => ({
  messageId: "m1",
  accessToken: "tok",
  mailbox: { id: "mb1", email: "me@example.com" },
  ...over,
});

describe("GmailInboxSource.fetchMessage", () => {
  it("maps a 200 message into MessageDetails (with isReply from headers)", async () => {
    fetchMock.mockResolvedValueOnce(
      okJson({
        id: "m1",
        threadId: "t1",
        labelIds: ["INBOX"],
        payload: {
          headers: [
            { name: "From", value: "outsider@external.com" },
            { name: "Subject", value: "Re: hello" },
            { name: "In-Reply-To", value: "<orig@msg>" },
          ],
        },
      })
    );
    const out = await source.fetchMessage(msgInput());
    expect(out).toMatchObject({
      id: "m1",
      messageId: "m1",
      threadId: "t1",
      from: "outsider@external.com",
      subject: "Re: hello",
      labelIds: ["INBOX"],
      isReply: true, // In-Reply-To header present
    });
    expect(out?.headers).toHaveLength(3);
  });

  it("returns null for a 404 (draft / deleted)", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, statusText: "Not Found" });
    const out = await source.fetchMessage(msgInput());
    expect(out).toBeNull();
  });

  it("returns null for a DRAFT label", async () => {
    fetchMock.mockResolvedValueOnce(
      okJson({
        id: "m1",
        threadId: "t1",
        labelIds: ["DRAFT"],
        payload: { headers: [] },
      })
    );
    const out = await source.fetchMessage(msgInput());
    expect(out).toBeNull();
  });

  it("returns null when id/threadId are missing from the payload", async () => {
    fetchMock.mockResolvedValueOnce(
      okJson({ id: null, threadId: null, payload: { headers: [] } })
    );
    const out = await source.fetchMessage(msgInput());
    expect(out).toBeNull();
  });

  it("returns null (not throw) on a non-ok non-404 response — error is swallowed", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Server Error",
      text: async () => "boom",
    });
    const out = await source.fetchMessage(msgInput());
    expect(out).toBeNull();
  });
});
