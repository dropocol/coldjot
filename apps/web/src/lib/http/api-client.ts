/**
 * Typed same-origin client for the web app's `/api/*` route handlers.
 *
 * Every call is relative (`/api/...`) and sends `credentials: "include"` so the
 * NextAuth session cookie travels with it. Mailops calls are intentionally NOT
 * routed through here — those go through `lib/queue/queue-api-client.ts`, which
 * attaches the `X-Service-Token` and the mailops base URL.
 */

/** Thrown for any non-2xx response. Carries the parsed body (or null). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(`API error ${status}`);
    this.name = "ApiError";
  }
}

async function parseBody(response: Response): Promise<unknown> {
  // 204 No Content (and any empty body) has nothing to parse.
  if (response.status === 204) return null;
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include",
  });

  if (!res.ok) {
    throw new ApiError(res.status, await parseBody(res));
  }

  return (await parseBody(res)) as T;
}

function withBody(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}

/** High-level helpers. `body` is JSON-encoded; `T` is the decoded response. */
export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, withBody("POST", body)),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, withBody("PUT", body)),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, withBody("PATCH", body)),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
