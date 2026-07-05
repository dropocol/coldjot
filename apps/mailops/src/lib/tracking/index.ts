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
/**
 * Track an email event and update sequence stats
 * @param emailId - The ID of the email being tracked
 * @param type - The type of event (sent, opened, clicked, etc.)
 * @param metadata - Additional metadata about the event
 * @param trackingData - Optional additional tracking data
 */
export async function trackEmailEvent(
  trackingId: string,
  // sequenceId: string,
  type: EmailEventType,
  metadata?: EmailEventMetadata,
  trackingData?: EmailTrackingMetadata
) {
  try {
    const sequenceId = trackingData?.sequenceId;

    if (!sequenceId) {
      throw new Error("Sequence ID is required for tracking");
    }

    // Check for existing event of this type for this email (except for clicks)
    if (type !== EmailEventEnum.CLICKED) {
      const existingEvent = await emailEventRepo.findFirstByTrackingTypeSequence(
        trackingId,
        type,
        sequenceId
      );

      if (existingEvent) {
        console.log(`Event ${type} already recorded for email ${trackingId}`);
        return existingEvent;
      }
    }

    // Create the event
    const event = await emailEventRepo.create({
      trackingId,
      type,
      sequenceId,
      metadata: metadata ? (JSON.parse(JSON.stringify(metadata)) as any) : (null as any),
      contactId: trackingData?.contactId,
    });

    // Update sequence stats
    const stats = await sequenceStatsRepo.getBySequence(sequenceId);

    if (!stats) {
      // Create initial stats if they don't exist
      await sequenceStatsRepo.createWithValues({
        sequenceId,
        contactId: trackingData?.contactId,
        totalEmails: type === EmailEventEnum.SENT ? 1 : 0,
        sentEmails: type === EmailEventEnum.SENT ? 1 : 0,
        openedEmails: type === EmailEventEnum.OPENED ? 1 : 0,
        clickedEmails: type === EmailEventEnum.CLICKED ? 1 : 0,
        repliedEmails: type === EmailEventEnum.REPLIED ? 1 : 0,
        bouncedEmails: type === EmailEventEnum.BOUNCED ? 1 : 0,
      });
      return event;
    }

    // Calculate updates based on event type
    const updates: Partial<Prisma.SequenceStatsUpdateInput> = {
      totalEmails:
        type === EmailEventEnum.SENT
          ? stats.totalEmails! + 1
          : stats.totalEmails,
    };

    switch (type) {
      case EmailEventEnum.SENT:
        updates.sentEmails = stats.sentEmails! + 1;
        // Recalculate all rates
        updates.openRate =
          (stats.openedEmails! / (stats.sentEmails! + 1)) * 100;
        updates.clickRate =
          (stats.clickedEmails! / (stats.sentEmails! + 1)) * 100;
        updates.replyRate =
          (stats.repliedEmails! / (stats.sentEmails! + 1)) * 100;
        updates.bounceRate =
          (stats.bouncedEmails! / (stats.sentEmails! + 1)) * 100;
        break;

      case EmailEventEnum.OPENED:
        updates.openedEmails = stats.openedEmails! + 1;
        updates.openRate =
          ((stats.openedEmails! + 1) / stats.sentEmails!) * 100;
        break;

      case EmailEventEnum.CLICKED:
        updates.clickedEmails = stats.clickedEmails! + 1;
        updates.clickRate =
          ((stats.clickedEmails! + 1) / stats.sentEmails!) * 100;
        break;

      case EmailEventEnum.REPLIED:
        updates.repliedEmails = stats.repliedEmails! + 1;
        updates.replyRate =
          ((stats.repliedEmails! + 1) / stats.sentEmails!) * 100;
        break;

      case EmailEventEnum.BOUNCED:
        updates.bouncedEmails = stats.bouncedEmails! + 1;
        updates.bounceRate =
          ((stats.bouncedEmails! + 1) / stats.sentEmails!) * 100;
        break;
    }

    // Update stats
    await sequenceStatsRepo.updateRaw(sequenceId, updates as any);

    console.log(`📊 Tracked email event:`, {
      trackingId,
      type,
      eventId: event.id,
    });

    return event;
  } catch (error) {
    console.error(`❌ Failed to track email event:`, error);
    throw error;
  }
}

// Helper function to safely calculate rates
const calculateRatesLocal = (stats: {
  totalEmails: number | null;
  sentEmails: number | null;
  openedEmails: number | null;
  clickedEmails: number | null;
  repliedEmails: number | null;
  bouncedEmails: number | null;
}) => {
  const denominator = Math.max((stats.sentEmails ?? 0) + 1, 1);
  return {
    openRate: ((stats.openedEmails ?? 0) / denominator) * 100,
    clickRate: ((stats.clickedEmails ?? 0) / denominator) * 100,
    replyRate: ((stats.repliedEmails ?? 0) / denominator) * 100,
    bounceRate: ((stats.bouncedEmails ?? 0) / denominator) * 100,
  };
};

export async function updateTrackingStats(
  sequenceId: string,
  type: EmailEventType
) {
  const stats = await sequenceStatsRepo.getBySequence(sequenceId);

  if (!stats) {
    return null;
  }

  // Calculate updates based on event type
  const updates: Partial<Prisma.SequenceStatsUpdateInput> = {
    totalEmails:
      type === EmailEventEnum.SENT
        ? (stats.totalEmails ?? 0) + 1
        : (stats.totalEmails ?? 0),
  };

  switch (type) {
    case EmailEventEnum.SENT:
      updates.sentEmails = (stats.sentEmails ?? 0) + 1;
      const sentRates = calculateRatesLocal({
        ...stats,
        sentEmails: (stats.sentEmails ?? 0) + 1,
      });
      Object.assign(updates, sentRates);
      break;

    case EmailEventEnum.OPENED:
      updates.openedEmails = (stats.openedEmails ?? 0) + 1;
      const openRates = calculateRatesLocal({
        ...stats,
        openedEmails: (stats.openedEmails ?? 0) + 1,
      });
      updates.openRate = openRates.openRate;
      break;

    case EmailEventEnum.CLICKED:
      updates.clickedEmails = (stats.clickedEmails ?? 0) + 1;
      const clickRates = calculateRatesLocal({
        ...stats,
        clickedEmails: (stats.clickedEmails ?? 0) + 1,
      });
      updates.clickRate = clickRates.clickRate;
      break;

    case EmailEventEnum.REPLIED:
      updates.repliedEmails = (stats.repliedEmails ?? 0) + 1;
      const replyRates = calculateRatesLocal({
        ...stats,
        repliedEmails: (stats.repliedEmails ?? 0) + 1,
      });
      updates.replyRate = replyRates.replyRate;
      break;

    case EmailEventEnum.BOUNCED:
      updates.bouncedEmails = (stats.bouncedEmails ?? 0) + 1;
      const bounceRates = calculateRatesLocal({
        ...stats,
        bouncedEmails: (stats.bouncedEmails ?? 0) + 1,
      });
      updates.bounceRate = bounceRates.bounceRate;
      break;
  }

  // Update stats atomically
  await sequenceStatsRepo.updateRaw(sequenceId, updates as any);
  return;
}

// The TrackingService class + singleton now live in services/domain/ (4a.2).
// This file re-exports them under the legacy names at the top.
