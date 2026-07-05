/**
 * Group C — PubSub handler characterization tests.
 *
 * Pins the CURRENT behavior of the Gmail inbox-sync pipeline so the Phase 4c
 * refactor (split into InboxSource + classify + apply-classification +
 * InboxSyncServiceImpl) is provably non-breaking.
 *
 * What's under test: notification decode, watch lookup, OAuth token refresh,
 * history fetch, message classification (reply/bounce/original), EmailEvent
 * writes, SequenceContact state changes.
 *
 * Phase 4c.5: now exercises InboxSyncServiceImpl (the new flat orchestrator)
 * instead of PubSubHandler. The mocking is unchanged — all at the
 * @coldjot/database fake boundary + global fetch + the gmail helper — because
 * InboxSyncServiceImpl routes through the same collaborators. Production
 * still wires PubSubHandler until 4c.6 swaps the call sites.
 */
import { vi } from "vitest";
import { setupTestContext } from "@/__tests__/helpers/test-context";

const ctx = setupTestContext();

// Stub global fetch — the handler calls Gmail REST endpoints directly.
// Routes match against the URL; first match wins.
// The history endpoint URL is `.../history?startHistoryId=...`; match it
// via a RegExp constructed at runtime so the lint rule about regex literals
// doesn't trip on the `?` quantifier.
const HISTORY_RE = new RegExp("[?&]startHistoryId=");
let fetchRoutes: Array<{ match: RegExp; respond: () => Promise<any> }> = [];
const fakeFetch = vi.fn(async (input: any) => {
  const url = typeof input === "string" ? input : input.toString();
  for (const r of fetchRoutes) {
    if (r.match.test(url)) return { ok: true, status: 200, statusText: "OK", json: async () => r.respond() };
  }
  return { ok: false, status: 404, statusText: "Not Found", text: async () => "no route", json: async () => ({}) };
});
vi.stubGlobal("fetch", fakeFetch);

import { InboxSyncServiceImpl } from "@/services/domain/inbox-sync.service";
import { NotificationType, EmailEventEnum } from "@coldjot/types";
import type { PubSubMessage } from "@coldjot/types";

beforeEach(() => {
  ctx.reset();
  fetchRoutes = [];
  fakeFetch.mockClear();
  // Re-stub each test — vi.unstubAllGlobals is NOT called, so the stub
  // persists, but clearing mock history + routes gives each test a clean slate.
  vi.stubGlobal("fetch", fakeFetch);
});

// ---- fixtures ---------------------------------------------------------

const MAILBOX_ID = "mbx-1";
const USER_ID = "usr-1";
const WATCH_ID = "watch-1";
const EMAIL = "sender@coldjot.dev";
const HISTORY_ID_NEW = "5000";

function seedWatchAndMailbox() {
  ctx.fake.seed(
    "emailWatch",
    {
      id: WATCH_ID,
      email: EMAIL,
      historyId: "1000",
    },
    ["email"]
  );
  ctx.fake.seed(
    "mailbox",
    {
      id: MAILBOX_ID,
      email: EMAIL,
      userId: USER_ID,
      access_token: "old-token",
      refresh_token: "r-token",
      expires_at: Date.now() - 1000,
      // The handler reads mailbox.aliases.length — include it inline.
      aliases: [],
    },
    ["email"]
  );
}

function makeMessage(messageId: string, from: string, headers: any[] = []): any {
  return {
    id: messageId,
    threadId: "thr-1",
    labelIds: ["INBOX"],
    payload: { headers },
  };
}

function makeHistoryResponse(messages: any[]): any {
  return { history: [{ id: "h1", messagesAdded: messages.map((m) => ({ message: m })) }], historyId: HISTORY_ID_NEW };
}

function makeMessageDetailsResponse(opts: {
  from?: string;
  subject?: string;
  labelIds?: string[];
  headers?: any[];
}): any {
  const headers = [
    { name: "From", value: opts.from ?? "external@example.com" },
    { name: "Subject", value: opts.subject ?? "Re: Hello" },
    // hasMessageContent() requires a Content-Type with multipart/text/html
    // or a positive Content-Length — include one so the message isn't skipped.
    { name: "Content-Type", value: "text/plain; charset=utf-8" },
    ...(opts.headers ?? []),
  ];
  return {
    id: "msg-1",
    threadId: "thr-1",
    labelIds: opts.labelIds ?? ["INBOX"],
    payload: { headers },
  };
}

function makeNotification(): PubSubMessage {
  return { data: "", messageId: "ps-1", publishTime: "2026-01-01T00:00:00Z" } as PubSubMessage;
}

// Encode the notification data the way the handler expects (base64 JSON).
function makeEncodedNotification(emailAddress = EMAIL, historyId = HISTORY_ID_NEW): PubSubMessage {
  const data = Buffer.from(
    JSON.stringify({ emailAddress, historyId: Number(historyId) })
  ).toString("base64");
  return { data, messageId: "ps-1", publishTime: "2026-01-01T00:00:00Z" } as PubSubMessage;
}

describe("[Group C] PubSubHandler.handleNotification", () => {
  // ---- Case 3: original-message / no-op path (no EmailEvent) -----------

  it("case 3: original message (own mailbox) writes no EmailEvent", async () => {
    seedWatchAndMailbox();
    // From is the user's own address → external=false → not a reply.
    // No bounce headers. isFirstMessage=true → ORIGINAL_MESSAGE.
    fetchRoutes.push({
      match: HISTORY_RE,
      respond: async () => makeHistoryResponse([makeMessage("msg-1", EMAIL)]),
    });
    fetchRoutes.push({
      match: /messages\/msg-1/,
      respond: async () => makeMessageDetailsResponse({ from: EMAIL }),
    });

    const handler = new InboxSyncServiceImpl();
    await handler.handleNotification(makeEncodedNotification());

    // No reply/bounce EmailEvent should be created.
    const events = [...ctx.fake.stores.emailEvent.rows.values()];
    expect(events.filter((e) => e.type === EmailEventEnum.REPLIED)).toHaveLength(0);
    expect(events.filter((e) => e.type === EmailEventEnum.BOUNCED)).toHaveLength(0);
  });

  // ---- Case 4: already-processed message is skipped -------------------

  it("case 4: already-processed message is skipped (no further calls)", async () => {
    seedWatchAndMailbox();
    // Seed a ProcessedMessage record so isMessageProcessed returns true.
    // messageId is the unique key isMessageProcessed queries by.
    ctx.fake.seed(
      "processedMessage",
      {
        id: "pm-1",
        messageId: "msg-1",
        threadId: "thr-1",
        type: NotificationType.MESSAGE_ADDED,
      },
      ["messageId"]
    );
    fetchRoutes.push({
      match: HISTORY_RE,
      respond: async () => makeHistoryResponse([makeMessage("msg-1", "ext@x.com")]),
    });

    const handler = new InboxSyncServiceImpl();
    await handler.handleNotification(makeEncodedNotification());

    // The message-details fetch should NOT have happened (skipped before it).
    const msgFetchCalls = fakeFetch.mock.calls.filter((c: any) =>
      /messages\/msg-1/.test(String(c[0]))
    );
    expect(msgFetchCalls.length).toBe(0);
  });

  // ---- Case 6: missing watch returns early ----------------------------

  it("case 6: no EmailWatch for the notification's email → returns early", async () => {
    // No watch seeded.
    const handler = new InboxSyncServiceImpl();
    await handler.handleNotification(makeEncodedNotification("unknown@x.com"));

    // No history fetch at all
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  // ---- Case 7: missing mailbox returns early --------------------------

  it("case 7: watch exists but no Mailbox → returns early", async () => {
    ctx.fake.seed(
      "emailWatch",
      { id: WATCH_ID, email: EMAIL, historyId: "1000" },
      ["email"]
    );
    // No mailbox seeded.

    const handler = new InboxSyncServiceImpl();
    await handler.handleNotification(makeEncodedNotification());

    expect(fakeFetch).not.toHaveBeenCalled();
  });

  // ---- Case 5: large history gap --------------------------------------

  it("case 5: large history gap → updates watch historyId, creates HISTORY_GAP record, no message processing", async () => {
    seedWatchAndMailbox();
    // historyId gap: watch has 1000, notification says 999999999 → huge gap.
    const bigNotification = makeEncodedNotification(EMAIL, "999999999");

    const handler = new InboxSyncServiceImpl();
    await handler.handleNotification(bigNotification);

    // Watch historyId updated to the latest
    const watchUpdate = ctx.fake.calls.find(
      (c) => c.model === "emailWatch" && c.op === "update"
    );
    expect(watchUpdate).toBeDefined();

    // A HISTORY_GAP watch-history record was created
    const gapRecords = [...ctx.fake.stores.emailWatchHistory.rows.values()].filter(
      (r) => r.notificationType === "HISTORY_GAP"
    );
    expect(gapRecords.length).toBeGreaterThanOrEqual(1);

    // No message processing — no ProcessedMessage records
    expect(ctx.fake.stores.processedMessage.rows.size).toBe(0);
  });

  // ---- Case 8: token refresh failure ----------------------------------

  it("case 8: token refresh returns null → returns early, no history fetch", async () => {
    seedWatchAndMailbox();
    // Make refreshTokenIfNeeded return null (set via the holder).
    const { refreshTokenIfNeeded } = await import("@/lib/google/gmail/helper");
    (refreshTokenIfNeeded as any).mockResolvedValueOnce(null);

    const handler = new InboxSyncServiceImpl();
    await handler.handleNotification(makeEncodedNotification());

    // No history fetch occurred
    const historyCalls = fakeFetch.mock.calls.filter((c: any) =>
      /history/.test(String(c[0]))
    );
    expect(historyCalls.length).toBe(0);
  });

  // ---- Case 2: bounce path --------------------------------------------

  it("case 2: bounce message → creates BOUNCED EmailEvent + updates SequenceContact + stats", async () => {
    seedWatchAndMailbox();
    // Seed the EmailThread that processBounce looks up.
    // threadId is the unique key processBounce/processReply query by.
    ctx.fake.seed(
      "emailThread",
      {
        id: "et-1",
        threadId: "thr-1",
        sequenceId: "seq-1",
        contactId: "ctc-1",
      },
      ["threadId"]
    );
    ctx.fake.seed("sequenceContact", {
      id: "sc-1",
      sequenceId: "seq-1",
      contactId: "ctc-1",
      status: "in_progress",
    });
    // processBounce/processReply require an existing SENT event (they link
    // the new event to the original send's trackingId).
    ctx.fake.seed("emailEvent", {
      id: "evt-sent",
      type: EmailEventEnum.SENT,
      sequenceId: "seq-1",
      contactId: "ctc-1",
      trackingId: "trk-1",
    });

    fetchRoutes.push({
      match: HISTORY_RE,
      respond: async () => makeHistoryResponse([makeMessage("msg-b", "ext@x.com")]),
    });
    fetchRoutes.push({
      match: /messages\/msg-b/,
      respond: async () =>
        makeMessageDetailsResponse({
          from: "mailer-daemon@x.com",
          headers: [{ name: "X-Failed-Recipients", value: "bad@x.com" }],
        }),
    });

    const handler = new InboxSyncServiceImpl();
    await handler.handleNotification(makeEncodedNotification());

    const bounces = [...ctx.fake.stores.emailEvent.rows.values()].filter(
      (e) => e.type === EmailEventEnum.BOUNCED
    );
    expect(bounces.length).toBeGreaterThanOrEqual(1);
    expect(ctx.stats).toHaveBeenCalledWith(
      "seq-1",
      EmailEventEnum.BOUNCED,
      "ctc-1"
    );
  });

  // ---- Case 1: reply path ---------------------------------------------

  it("case 1: reply message → creates REPLIED EmailEvent + updates SequenceContact + stats", async () => {
    seedWatchAndMailbox();
    ctx.fake.seed(
      "emailThread",
      {
        id: "et-1",
        threadId: "thr-1",
        sequenceId: "seq-1",
        contactId: "ctc-1",
      },
      ["threadId"]
    );
    ctx.fake.seed("sequenceContact", {
      id: "sc-1",
      sequenceId: "seq-1",
      contactId: "ctc-1",
      status: "in_progress",
    });
    // processBounce/processReply require an existing SENT event (they link
    // the new event to the original send's trackingId).
    ctx.fake.seed("emailEvent", {
      id: "evt-sent",
      type: EmailEventEnum.SENT,
      sequenceId: "seq-1",
      contactId: "ctc-1",
      trackingId: "trk-1",
    });
    // processReply does emailThread.findUnique({ include: { sequence: true } })
    // — seed the Sequence row so the include resolves.
    ctx.fake.seed("sequence", { id: "seq-1", status: "active", userId: USER_ID });

    fetchRoutes.push({
      match: HISTORY_RE,
      respond: async () => makeHistoryResponse([makeMessage("msg-r", "ext@x.com")]),
    });
    fetchRoutes.push({
      match: /messages\/msg-r/,
      respond: async () =>
        makeMessageDetailsResponse({
          from: "ext@x.com",
          headers: [{ name: "In-Reply-To", value: "<orig@test>" }],
        }),
    });

    const handler = new InboxSyncServiceImpl();
    await handler.handleNotification(makeEncodedNotification());

    const replies = [...ctx.fake.stores.emailEvent.rows.values()].filter(
      (e) => e.type === EmailEventEnum.REPLIED
    );
    expect(replies.length).toBeGreaterThanOrEqual(1);
    expect(ctx.stats).toHaveBeenCalledWith(
      "seq-1",
      EmailEventEnum.REPLIED,
      "ctc-1"
    );
  });
});
