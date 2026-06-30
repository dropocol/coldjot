import { env } from "@/env";

/**
 * Base URL of the mailops service, without a trailing /api suffix.
 * (Callers append `/api/...` themselves.)
 */
export const MAILOPS_BASE_URL = (
  env.NEXT_PUBLIC_MAILOPS_API_URL || "http://localhost:3001"
).replace(/\/api\/?$/, "");

/**
 * Headers required for an authenticated call from the web app to mailops.
 * Includes the shared X-Service-Token (plan 03). Spread into any fetch()
 * that targets an internal mailops route.
 *
 * Usage:
 *   const res = await fetch(`${MAILOPS_BASE_URL}/api/lists/${id}/sync`, {
 *     method: "POST",
 *     headers: { ...mailopsAuthHeaders(), "Content-Type": "application/json" },
 *     body: JSON.stringify({ ... }),
 *   });
 */
export function mailopsAuthHeaders(): Record<string, string> {
  return {
    "X-Service-Token": env.MAILOPS_SERVICE_TOKEN,
  };
}
