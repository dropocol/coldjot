/**
 * Adapter tests for GmailTransport — replays synthetic Gmail API response
 * fixtures against the transport and asserts it maps them into the
 * MailTransport domain shapes correctly.
 *
 * No live Gmail: these fixtures are hand-built from the gmail_v1 response
 * schema. When dev Gmail credentials are available, a one-time
 * `scripts/record-gmail-fixtures.ts` can capture real payloads into
 * `gmail-transport.fixture.json`; the assertion shapes stay the same.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Stub gmailClientService.getClient to return a controllable gmail object.
const gmailStub = vi.hoisted(() => ({
  client: null as any,
}));
vi.mock("@/lib/google", () => ({
  gmailClientService: {
    getClient: vi.fn(async () => gmailStub.client),
  },
}));

import { GmailTransport } from "@/adapters/gmail-transport";

/** Build a fake gmail.users.messages with the four ops the transport uses. */
function makeGmail(responses: {
  send?: any;
  insert?: any;
  delete?: () => Promise<void>;
  get?: any;
}) {
  return {
    users: {
      messages: {
        send: vi.fn(async () => ({ data: responses.send ?? { id: "msg-1", threadId: "thr-1" } })),
        insert: vi.fn(async () => ({ data: responses.insert ?? { id: "ins-1" } })),
        delete: vi.fn(responses.delete ?? (async () => undefined)),
        get: vi.fn(async () => ({ data: responses.get })),
      },
    },
  };
}

let transport: GmailTransport;

beforeEach(() => {
  vi.clearAllMocks();
  transport = new GmailTransport();
});

describe("GmailTransport.send", () => {
  it("maps Gmail's send response to { id, threadId }", async () => {
    gmailStub.client = makeGmail({
      send: { id: "g-msg-1", threadId: "g-thr-1" },
    });
    const out = await transport.send({ userId: "me", mailboxId: "mb1", raw: "abc", threadId: "t1" });
    expect(out).toEqual({ id: "g-msg-1", threadId: "g-thr-1" });
    // send called with userId:"me" + the raw/threadId body.
    const gmail = gmailStub.client;
    expect(gmail.users.messages.send).toHaveBeenCalledWith({
      userId: "me",
      requestBody: { raw: "abc", threadId: "t1" },
    });
  });

  it("omits threadId from the body when not provided", async () => {
    gmailStub.client = makeGmail({ send: { id: "m", threadId: "t" } });
    await transport.send({ userId: "me", mailboxId: "mb1", raw: "abc" });
    expect(gmailStub.client.users.messages.send).toHaveBeenCalledWith({
      userId: "me",
      requestBody: { raw: "abc", threadId: undefined },
    });
  });

  it("returns threadId undefined when Gmail omits it", async () => {
    gmailStub.client = makeGmail({ send: { id: "m" } });
    const out = await transport.send({ userId: "me", mailboxId: "mb1", raw: "abc" });
    expect(out).toEqual({ id: "m", threadId: undefined });
  });
});

describe("GmailTransport.insert", () => {
  it("maps Gmail's insert response to { id }", async () => {
    gmailStub.client = makeGmail({ insert: { id: "ins-9" } });
    const out = await transport.insert({
      userId: "me",
      mailboxId: "mb1",
      raw: "xyz",
      threadId: "t1",
      labelIds: ["SENT"],
    });
    expect(out).toEqual({ id: "ins-9" });
    expect(gmailStub.client.users.messages.insert).toHaveBeenCalledWith({
      userId: "me",
      requestBody: { raw: "xyz", threadId: "t1", labelIds: ["SENT"] },
    });
  });
});

describe("GmailTransport.delete", () => {
  it("calls gmail.users.messages.delete with the id", async () => {
    const del = vi.fn(async () => undefined);
    gmailStub.client = makeGmail({ delete: del });
    await transport.delete("msg-1", "me", "mb1");
    expect(del).toHaveBeenCalledWith({ userId: "me", id: "msg-1" });
  });
});

describe("GmailTransport.getSentDetails", () => {
  it("extracts Message-ID + Subject + threadId from the payload headers", async () => {
    gmailStub.client = makeGmail({
      get: {
        id: "msg-1",
        threadId: "thr-1",
        payload: {
          headers: [
            { name: "Message-Id", value: "<real-msg-id@mail.example>" },
            { name: "Subject", value: "Hello world" },
            { name: "From", value: "sender@example.com" },
          ],
        },
      },
    });
    const out = await transport.getSentDetails("msg-1", "me", "mb1");
    expect(out).toEqual({
      messageId: "<real-msg-id@mail.example>",
      subject: "Hello world",
      threadId: "thr-1",
      headers: [
        { name: "Message-Id", value: "<real-msg-id@mail.example>" },
        { name: "Subject", value: "Hello world" },
        { name: "From", value: "sender@example.com" },
      ],
    });
  });

  it("falls back to the passed id when Message-Id header is absent", async () => {
    gmailStub.client = makeGmail({
      get: { id: "fallback-id", threadId: "t", payload: { headers: [] } },
    });
    const out = await transport.getSentDetails("fallback-id", "me", "mb1");
    expect(out.messageId).toBe("fallback-id");
    expect(out.subject).toBeUndefined();
  });
});

describe("GmailTransport.getClient", () => {
  it("delegates to gmailClientService.getClient(userId, mailboxId)", async () => {
    gmailStub.client = makeGmail({});
    const out = await transport.getClient("u1", "mb1");
    expect(out).toBe(gmailStub.client);
    const { gmailClientService } = await import("@/lib/google");
    expect(gmailClientService.getClient).toHaveBeenCalledWith("u1", "mb1");
  });
});
