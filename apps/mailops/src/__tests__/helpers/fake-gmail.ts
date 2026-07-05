/**
 * Fake gmail_v1.Gmail client for characterization tests.
 *
 * Records every call so tests can assert on the transport surface, and returns
 * canned responses so the email/pubsub code paths complete without hitting the
 * real Gmail API.
 */
import type { gmail_v1 } from "googleapis";

export interface GmailResponses {
  /** Returned by users.messages.send. */
  send?: Partial<gmail_v1.Schema$Message> & { id?: string; threadId?: string };
  /** Returned by users.messages.get (the "sent message details" fetch). */
  get?: Partial<gmail_v1.Schema$Message> & {
    payload?: { headers?: gmail_v1.Schema$MessagePartHeader[] };
  };
  /** Returned by users.messages.insert (the untracked copy). */
  insert?: Partial<gmail_v1.Schema$Message> & { id?: string };
  /** Returned by users.threads.get (the "thread info" fetch in getEmailThreadInfo). */
  thread?: { messages?: Array<{ payload?: { headers?: gmail_v1.Schema$MessagePartHeader[] } }> };
}

export interface GmailCall {
  op: "send" | "get" | "insert" | "delete";
  args: any;
}

export interface FakeGmail {
  /** The gmail_v1.Gmail-shaped object to inject. */
  gmail: gmail_v1.Gmail;
  /** Recorded calls, in order. */
  calls: GmailCall[];
}

const DEFAULT_GET_HEADERS: gmail_v1.Schema$MessagePartHeader[] = [
  { name: "Message-ID", value: "<default-msg-id@test>" },
  { name: "Subject", value: "Default Subject" },
];

export function makeFakeGmail(responses: GmailResponses = {}): FakeGmail {
  const calls: GmailCall[] = [];

  // NOTE: read the canned responses LAZILY (at call time, not construction
  // time). test-context memoizes a single fake gmail per test (to mirror the
  // real GmailClientService client cache), and tests set/override
  // `ctx.gmailResponses.*` AFTER the fake is constructed in beforeEach. If we
  // captured the responses up front, the memoized fake would never see the
  // overrides. Reading `responses.send` etc. inside each handler resolves the
  // current value on every call.
  const gmail = {
    users: {
      messages: {
        send: async (args: any) => {
          calls.push({ op: "send", args });
          return { data: responses.send ?? { id: "msg-1", threadId: "thr-1" } };
        },
        get: async (args: any) => {
          calls.push({ op: "get", args });
          return {
            data:
              responses.get ?? {
                id: "msg-1",
                threadId: "thr-1",
                payload: { headers: DEFAULT_GET_HEADERS },
              },
          };
        },
        insert: async (args: any) => {
          calls.push({ op: "insert", args });
          return { data: responses.insert ?? { id: "msg-untracked-1" } };
        },
        delete: async (args: any) => {
          calls.push({ op: "delete", args });
          return {};
        },
      },
      threads: {
        get: async (args: any) => {
          calls.push({ op: "threadGet" as any, args });
          return { data: responses.thread ?? { messages: [] } };
        },
      },
      // Some code paths touch users.getProfile — stub it.
      getProfile: async () => ({ data: { emailAddress: "test@coldjot.dev" } }),
    },
  } as unknown as gmail_v1.Gmail;

  return { gmail, calls };
}

/**
 * Fake for global `fetch()` — used by PubSubHandler to call Gmail REST
 * endpoints (history.list, messages.get). Records calls and returns canned
 * responses.
 */
export interface FetchResponse {
  ok?: boolean;
  status?: number;
  json?: () => Promise<any>;
  text?: () => Promise<string>;
}

export function makeFakeFetch(
  router: (url: string) => FetchResponse | Promise<FetchResponse>
): { fetch: typeof fetch; calls: Array<{ url: string; init?: any }> } {
  const calls: Array<{ url: string; init?: any }> = [];
  const fakeFetch = async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init });
    const res = await router(url);
    const ok = res.ok ?? (res.status ? res.status >= 200 && res.status < 300 : true);
    const status = res.status ?? 200;
    return {
      ok,
      status,
      json: res.json ?? (async () => ({})),
      text: res.text ?? (async () => ""),
    };
  };
  return { fetch: fakeFetch as unknown as typeof fetch, calls };
}
