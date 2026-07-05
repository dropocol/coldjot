import { EmailTracking } from "@coldjot/types";
import { PrismaTrackedLinkRepository } from "@/repositories/prisma/prisma-tracked-link.repo";

// The TrackingService class + singleton moved to services/domain/ in 4a.2.
// Re-exported here under the legacy names so existing
// `import { TrackingService, trackingService } from "@/lib/tracking"` imports
// keep resolving until callers are migrated.
export {
  TrackingServiceImpl as TrackingService,
  trackingService,
} from "@/services/domain/tracking.service";

// Pure helpers (moved to their own modules in 4a.1; re-exported here so
// existing `from "@/lib/tracking"` imports keep resolving).
export { generateTrackingPixel } from "./pixel";
export { calculateRates } from "./stats";
export {
  addTrackingToEmail as addTrackingToEmailPure,
  wrapLinksWithTracking,
} from "./link-wrap";

// Module-level repository singleton (stopgap until the addTrackingToEmail
// caller picks up the pure version directly; trackedLinkRepo is used by
// createTrackedLink below).
const trackedLinkRepo = new PrismaTrackedLinkRepository();

// 4a.5: the standalone createEmailTracking fn moved onto TrackingServiceImpl
// (services/domain/tracking.service.ts) as createTracking. The EmailProcessor
// caller now uses trackingService.createTracking. This file no longer defines
// createEmailTracking; the legacy import path resolves to the re-exported
// TrackingService above.

// 4a.4: dead standalone exports deleted here — recordEmailOpen,
// recordLinkClick, getEmailEvents, getSequenceEvents. All had zero live
// callers (the route controller uses trackingService.{handleEmailOpen,
// handleLinkClick,trackEmailEvent} from services/domain/). recordEmailOpen
// was pinned by characterization case 4; that case is deleted alongside.

export async function createTrackedLink(
  emailTrackingId: string,
  originalUrl: string
): Promise<string> {
  try {
    const trackedLink = await trackedLinkRepo.create({
      emailTrackingId,
      originalUrl,
    });
    return trackedLink.id;
  } catch (error) {
    console.error("Error creating tracked link:", error);
    throw new Error(
      `Failed to create tracked link: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

// NOTE: the public `addTrackingToEmail` keeps its original (no-callback)
// signature for backwards compat during the 4a migration. It delegates to the
// pure version, binding the createLink callback to the module-level repo
// singleton. 4a.5 moves the live caller onto the TrackingService and this
// wrapper is deleted alongside the standalone dead exports.
import {
  addTrackingToEmail as addTrackingToEmailImpl,
} from "./link-wrap";

export async function addTrackingToEmail(
  content: string,
  tracking: EmailTracking
): Promise<string> {
  try {
    return await addTrackingToEmailImpl(content, tracking, (id, url) =>
      createTrackedLink(id, url)
    );
  } catch (error) {
    console.error("Error adding tracking to email:", error);
    throw new Error(
      `Failed to add tracking to email: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

// 4a.3: the dead standalone `trackEmailEvent` (inline rate math) and
// `updateTrackingStats` (calculateRates path) were deleted here. Both had zero
// live callers — the route controller uses `trackingService.trackEmailEvent`
// (the class method, now TrackingServiceImpl.trackEmailEvent), and the live
// stats path is TrackingServiceImpl → lib/stats.updateSequenceStats. The
// characterization cases that pinned these dead fns (6, 6b, 7) were deleted
// alongside them — they pinned dead code, not behavior.

// The TrackingService class + singleton now live in services/domain/ (4a.2).
// This file re-exports them under the legacy names at the top.
