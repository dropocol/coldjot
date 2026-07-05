import { AppUrlEnum } from "@coldjot/types";
import { getBaseUrl } from "@/utils";

/**
 * Pure helper: build the transparent tracking-pixel <img> tag for a hash.
 *
 * Extracted verbatim from lib/tracking/index.ts (Phase 4a.1). No DB, no logger.
 */
export function generateTrackingPixel(hash: string): string {
  if (!hash) {
    throw new Error("Hash is required for tracking pixel generation");
  }

  const baseUrl = getBaseUrl(AppUrlEnum.TRACKING);
  const trackingUrl = new URL(`${baseUrl}/api/track/${hash}.png`);
  return `<img src="${trackingUrl.toString()}" alt="" style="display:none" width="1" height="1" />`;
}
