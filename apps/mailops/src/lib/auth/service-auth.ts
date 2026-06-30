import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { logger } from "@/lib/log";

/**
 * Timing-safe string comparison to avoid token-equality timing attacks.
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Requires a valid `X-Service-Token` header matching SERVICE_INTERNAL_TOKEN.
 *
 * Use on every internal route that the web app calls. The web app must send
 * the same token value via the `X-Service-Token` header.
 *
 * Public endpoints (health, tracking pixel, PubSub webhook) are NOT mounted
 * behind this middleware — they have their own protections.
 *
 * Auth-failures here are logged at warn so they're visible without filling
 * the log on a sustained attack.
 */
export function requireServiceToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const expected = process.env.SERVICE_INTERNAL_TOKEN;
  const provided = req.header("x-service-token");

  if (!expected) {
    // SERVICE_INTERNAL_TOKEN unset — fail closed rather than open.
    logger.error(
      "SERVICE_INTERNAL_TOKEN is not set; refusing all internal requests"
    );
    return res.status(503).json({ error: "Service auth not configured" });
  }

  if (!provided || !timingSafeEqualStr(provided, expected)) {
    logger.warn(
      { path: req.path, method: req.method },
      "Rejected internal request: missing or invalid service token"
    );
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}
