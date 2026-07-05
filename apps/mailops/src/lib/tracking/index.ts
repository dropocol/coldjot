import {
  EmailTrackingMetadata,
  EmailTracking,
  EmailTrackingEnum,
  EmailEventEnum,
} from "@coldjot/types";
import { nanoid } from "nanoid";
import { updateSequenceStats } from "@/lib/stats";
import type { Prisma } from "@prisma/client";
import { EmailEventType, EmailEventMetadata } from "@coldjot/types";
import { logger } from "@/lib/log";
import { PrismaEmailTrackingRepository } from "@/repositories/prisma/prisma-email-tracking.repo";
import { PrismaEmailEventRepository } from "@/repositories/prisma/prisma-email-event.repo";
import { PrismaTrackedLinkRepository } from "@/repositories/prisma/prisma-tracked-link.repo";
import { PrismaLinkClickRepository } from "@/repositories/prisma/prisma-link-click.repo";
import { PrismaSequenceStatsRepository } from "@/repositories/prisma/prisma-sequence-stats.repo";
import { prisma } from "@coldjot/database";

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

// Module-level repository singletons (stopgap until Phase 4a collapses the
// standalone functions into the TrackingService class).
const emailTrackingRepo = new PrismaEmailTrackingRepository();
const emailEventRepo = new PrismaEmailEventRepository();
const trackedLinkRepo = new PrismaTrackedLinkRepository();
const linkClickRepo = new PrismaLinkClickRepository();
const sequenceStatsRepo = new PrismaSequenceStatsRepository();

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

export async function recordEmailOpen(hash: string): Promise<void> {
  try {
    const emailTracking = await emailTrackingRepo.findByHash(hash);

    if (!emailTracking) {
      throw new Error("No tracking event found");
    }

    // Check for existing open event
    const existingOpenEvent = await emailEventRepo.findFirstByTrackingAndType(
      emailTracking.id,
      EmailEventEnum.OPENED
    );

    // Always increment the open count on the tracking event
    await emailTrackingRepo.incrementOpenStatus(hash, !existingOpenEvent);

    // Only create an email event and update stats if this is the first open
    if (!existingOpenEvent) {
      await emailEventRepo.create({
        trackingId: emailTracking.id,
        type: EmailEventEnum.OPENED,
        sequenceId: emailTracking.sequenceId,
        contactId: emailTracking.contactId,
        metadata: {
          isFirstOpen: true,
          openCount: 1,
        } as any,
      });

      // Update sequence stats only for unique opens
      if (emailTracking.sequenceId && emailTracking.contactId) {
        await updateSequenceStats(
          emailTracking.sequenceId,
          EmailEventEnum.OPENED,
          emailTracking.contactId,
          { isUniqueOpen: true }
        );
      }
    }
  } catch (error) {
    console.error("Error recording email open:", error);
    throw error;
  }
}

export async function recordLinkClick(linkId: string): Promise<void> {
  try {
    const trackedLink = await trackedLinkRepo.findWithTracking(linkId);

    if (!trackedLink || !trackedLink.emailTracking) {
      throw new Error("No tracked link found");
    }

    // Create click record and update click count in a transaction
    await prisma.$transaction(async (prisma) => {
      // Create click record
      await prisma.linkClick.create({
        data: {
          trackedLinkId: linkId,
          timestamp: new Date(),
        },
      });

      // Increment click count
      await prisma.trackedLink.update({
        where: { id: linkId },
        data: {
          clickCount: {
            increment: 1,
          },
          updatedAt: new Date(),
        },
      });
    });

    // Always update stats for clicks as we want to track all clicks
    // TODO: fix this
    if (
      trackedLink.emailTracking.sequenceId &&
      trackedLink.emailTracking.contactId
    ) {
      // await updateSequenceStats(
      //   trackedLink.emailTracking.sequenceId!,
      //   EmailEventEnum.CLICKED,
      //   trackedLink.emailTracking.contactId!
      // );
    }
  } catch (error) {
    console.error("Error recording link click:", error);
    throw error;
  }
}

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
  wrapLinksWithTracking as wrapLinksWithTrackingImpl,
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

export async function getEmailEvents(trackingId: string) {
  return await emailEventRepo.listByTracking(trackingId);
}

export async function getSequenceEvents(
  sequenceId: string,
  timeframe?: { start: Date; end: Date }
) {
  // Note: the original included { Contact: true }; the repo's listByTracking
  // doesn't cover this shape. Keep this on prisma directly until Phase 4
  // introduces a richer event-listing method.
  const where = {
    sequenceId,
    ...(timeframe && {
      timestamp: {
        gte: timeframe.start,
        lte: timeframe.end,
      },
    }),
  };

  return await prisma.emailEvent.findMany({
    where,
    orderBy: { timestamp: "desc" },
    include: {
      Contact: true,
    },
  });
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
