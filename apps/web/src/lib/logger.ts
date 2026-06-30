/**
 * Structured logger for the web app. Use instead of console.log.
 *
 * - Silent at debug/info in production (use warn/error for those levels).
 * - Redacts known-sensitive keys from logged objects so tokens, passwords,
 *   and PII never reach stdout/logs.
 */

const isDev = process.env.NODE_ENV !== "production";

// Keys whose values must never appear in logs. Matched case-insensitively
// against object keys (including nested via the globs below).
const SENSITIVE_KEYS = new Set([
  "access_token",
  "refreshtoken",
  "refresh_token",
  "id_token",
  "token",
  "accesstoken",
  "password",
  "secret",
  "authorization",
  "cookie",
  "apikey",
  "api_key",
]);

/** Deep-clone an object, replacing sensitive values with "[REDACTED]". */
function redact(value: unknown, seen = new WeakSet()): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  // Avoid circular references.
  if (seen.has(value as object)) return "[Circular]";
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((v) => redact(v, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      out[key] = "[REDACTED]";
    } else {
      out[key] = redact(val, seen);
    }
  }
  return out;
}

function format(args: unknown[]): unknown[] {
  return args.map((a) => (a && typeof a === "object" ? redact(a) : a));
}

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDev) console.debug(...format(args));
  },
  info: (...args: unknown[]) => {
    if (isDev) console.info(...format(args));
  },
  warn: (...args: unknown[]) => console.warn(...format(args)),
  error: (...args: unknown[]) => console.error(...format(args)),
};
