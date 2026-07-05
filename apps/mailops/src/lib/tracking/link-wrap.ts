import { AppUrlEnum, type EmailTracking } from "@coldjot/types";
import { getBaseUrl } from "@/utils";
import { generateTrackingPixel } from "./pixel";

/**
 * Pure-ish helpers for wrapping outgoing email content with tracking links +
 * the tracking pixel.
 *
 * Extracted from lib/tracking/index.ts (Phase 4a.1). The only DB touch is the
 * `createLink` callback (creates a TrackedLink row), which is *injected* by the
 * caller so this module stays free of repository imports.
 */

/**
 * Wrap a link's href with a tracking-redirect URL.
 *
 * `createLink(emailTrackingId, originalUrl)` is injected by the caller (the
 * TrackingService binds it to `trackedLinkRepo.create`). Returns the rewritten
 * content. Strips the noisy `console.log`s the original had.
 */
export async function wrapLinksWithTracking(
  content: string,
  hash: string,
  trackingId: string,
  createLink: (
    emailTrackingId: string,
    originalUrl: string
  ) => Promise<string>
): Promise<string> {
  if (!content || !hash || !trackingId) {
    throw new Error(
      "Content, hash, and tracking ID are required for link tracking"
    );
  }

  const baseUrl = getBaseUrl(AppUrlEnum.TRACKING);
  const trackingBaseUrl = `${baseUrl}/api/track/${hash}/click`;

  // Collect all href matches first so we can create links and rewrite in order.
  const matches: { match: string; url: string }[] = [];
  content.replace(
    /<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1/gi,
    (match, _quote, url) => {
      if (url.trim()) {
        matches.push({ match, url });
      }
      return match;
    }
  );

  for (const { match, url } of matches) {
    const linkId = await createLink(trackingId, url);
    const trackingUrl = new URL(trackingBaseUrl);
    trackingUrl.searchParams.set("lid", linkId);
    content = content.replace(match, `<a href="${trackingUrl.toString()}"`);
  }

  return content;
}

/**
 * Inject tracking into outgoing email content: wrap links (if enabled) + append
 * the pixel. In development, prepend a debug block.
 *
 * `createLink` is injected (same as `wrapLinksWithTracking`).
 */
export async function addTrackingToEmail(
  content: string,
  tracking: EmailTracking,
  createLink: (
    emailTrackingId: string,
    originalUrl: string
  ) => Promise<string>
): Promise<string> {
  if (!content || !tracking) {
    throw new Error("Content and tracking information are required");
  }

  let trackedContent = content;

  if (tracking.wrappedLinks) {
    trackedContent = await wrapLinksWithTracking(
      trackedContent,
      tracking.hash!,
      tracking.id!,
      createLink
    );
  }

  // Development-only debug block above the content.
  if (process.env.NODE_ENV === "development") {
    const baseUrl = getBaseUrl(AppUrlEnum.TRACKING);
    const trackingUrl = new URL(`${baseUrl}/api/track/${tracking.hash}`);
    const devTrackingInfo = `
      <div style="background: #f0f0f0; padding: 10px; margin: 10px 0; font-family: monospace; font-size: 12px;">
        <p><strong>Development Tracking Info:</strong></p>
        <p>Tracking Hash: ${tracking.hash}</p>
        <p>Tracking URL: ${trackingUrl.toString()}</p>
        <p>Email: ${tracking.metadata.email}</p>
        <p>Tracking ID: ${tracking.id}</p>
      </div>
    `;
    trackedContent = devTrackingInfo + trackedContent;
  }

  trackedContent += tracking.pixel;

  return trackedContent;
}

/** Re-export so existing `generateTrackingPixel` importers from this barrel keep working. */
export { generateTrackingPixel };
