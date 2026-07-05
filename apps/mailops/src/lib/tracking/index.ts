import {
  EmailTrackingMetadata,
  EmailTracking,
  EmailTrackingEnum,
} from "@coldjot/types";
import { nanoid } from "nanoid";
import { logger } from "@/lib/log";
import { PrismaEmailTrackingRepository } from "@/repositories/prisma/prisma-email-tracking.repo";
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

// Module-level repository singletons (stopgap until Phase 4a.5 moves
// createEmailTracking onto the TrackingService and the addTrackingToEmail
// caller picks up the pure version directly).
const emailTrackingRepo = new PrismaEmailTrackingRepository();
const trackedLinkRepo = new PrismaTrackedLinkRepository();

export async function createEmailTracking(
  metadata: EmailTrackingMetadata
): Promise<EmailTracking> {
  try {
    // Validate required fields
    const requiredFields = [
      "email",
      "userId",
      "sequenceId",
      "stepId",
      "contactId",
    ];

    logger.info("🔍 Creating tracking object");

    const missingFields = requiredFields.filter(
      (field) => !metadata[field as keyof EmailTrackingMetadata]
    );

    if (missingFields.length > 0) {
      throw new Error(
        `Missing required metadata fields: ${missingFields.join(", ")}`
      );
    }

    const hash = await nanoid(48);

    const eventData = {
      hash,
      userId: metadata.userId,
      sequenceId: metadata.sequenceId,
      stepId: metadata.stepId,
      contactId: metadata.contactId,
      status: "pending",
      subject: metadata.subject,
      // Stamp the BullMQ job id so the email processor's idempotency guard
      // can detect a re-attempted job that already sent (plan 10).
      jobId: metadata.jobId,
      metadata: {
        email: metadata.email,
        userId: metadata.userId,
        sequenceId: metadata.sequenceId,
        stepId: metadata.stepId,
        contactId: metadata.contactId,
      },
    };

    const trackingEvent = await emailTrackingRepo.createPending({
      hash,
      userId: metadata.userId!,
      sequenceId: metadata.sequenceId!,
      stepId: metadata.stepId!,
      contactId: metadata.contactId!,
      subject: metadata.subject,
      jobId: metadata.jobId,
      status: "pending",
      metadata: {
        email: metadata.email,
        userId: metadata.userId,
        sequenceId: metadata.sequenceId,
        stepId: metadata.stepId,
        contactId: metadata.contactId,
      } as any,
    });

    const tracking: EmailTracking = {
      id: trackingEvent.id,
      hash,
      metadata: { ...metadata, hash },
      type: EmailTrackingEnum.SEQUENCE,
      pixel: generateTrackingPixelLocal(hash),
      wrappedLinks: true,
      trackingId: trackingEvent.id, // Add tracking ID for link association
    };

    return tracking;
  } catch (error) {
    console.error("Error creating email tracking:", error);
    throw new Error(
      `Failed to create email tracking: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

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
import { generateTrackingPixel as generateTrackingPixelLocal } from "./pixel";

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
