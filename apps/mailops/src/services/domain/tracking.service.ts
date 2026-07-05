import {
  EmailEventEnum,
  EmailTrackingStatusEnum,
  EmailTrackingEnum,
  type EmailEventType,
  type EmailEventMetadata,
  type EmailTracking,
  type EmailTrackingMetadata,
} from "@coldjot/types";
import { nanoid } from "nanoid";
import { logger } from "@/lib/log";
import { updateSequenceStats } from "@/lib/stats";
import { prisma } from "@coldjot/database";
import { generateTrackingPixel } from "@/lib/tracking/pixel";

import type { EmailTrackingRepository } from "@/repositories/email-tracking.repo";
import type { EmailEventRepository } from "@/repositories/email-event.repo";

import { PrismaEmailTrackingRepository } from "@/repositories/prisma/prisma-email-tracking.repo";
import { PrismaEmailEventRepository } from "@/repositories/prisma/prisma-email-event.repo";

/**
 * Domain service interface — what tracking *does*, not how.
 * Phase 4 replaces the current TrackingService impl behind this contract.
 */
export interface TrackingService {
  /** Create a 'pending' tracking row + return the domain EmailTracking object. */
  createTracking(metadata: EmailTrackingMetadata): Promise<EmailTracking>;
  /** Record an email open (creates OPENED event on first open). */
  handleEmailOpen(hash: string): Promise<void>;
  /** Record a link click; returns the redirect URL. */
  handleLinkClick(hash: string, linkId: string): Promise<string>;
  /** Record a generic email event. */
  trackEmailEvent(input: {
    trackingId: string;
    eventType: EmailEventType;
    metadata?: EmailEventMetadata;
  }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Implementation (Phase 4a.2)
// ---------------------------------------------------------------------------

/**
 * Live `TrackingServiceImpl` — the canonical open/click/event path.
 *
 * The route controller calls these three methods. The duplicate standalone
 * functions that used to live in `lib/tracking/index.ts` are deleted in 4a.4
 * (open / click / generic-event standalones) and 4a.3 (stats standalones).
 *
 * Repositories are constructor-injected with Prisma defaults so `new
 * TrackingServiceImpl()` works for the characterization tests (the defaults
 * import `prisma` from `@coldjot/database`, which the test harness mocks). The
 * composition root passes real repos; Phase 6 threads this through `createApp()`
 * properly.
 *
 * NOTE: `handleLinkClick`'s linkClick + trackedLink + emailTracking writes
 * remain on the `$transaction` tx client for atomicity. Phase 4 collapses
 * these — the lint rule stays at `warn` until then (see STATUS.md).
 */
export class TrackingServiceImpl implements TrackingService {
  constructor(
    private readonly emailTracking: EmailTrackingRepository = new PrismaEmailTrackingRepository(),
    private readonly emailEvent: EmailEventRepository = new PrismaEmailEventRepository()
  ) {}

  async createTracking(metadata: EmailTrackingMetadata): Promise<EmailTracking> {
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

    const trackingEvent = await this.emailTracking.createPending({
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

    return {
      id: trackingEvent.id,
      hash,
      metadata: { ...metadata, hash },
      type: EmailTrackingEnum.SEQUENCE,
      pixel: generateTrackingPixel(hash),
      wrappedLinks: true,
      trackingId: trackingEvent.id, // link association for addTrackingToEmail
    };
  }

  async handleEmailOpen(hash: string): Promise<void> {
    try {
      const tracking = await this.emailTracking.findWithOpenEvents(hash);

      if (!tracking) {
        logger.warn(`No tracking record found for hash: ${hash}`);
        return;
      }

      const isFirstOpen = tracking.events.length === 0;

      // Always increment the open count and update timestamps
      await this.emailTracking.recordOpen(
        hash,
        tracking.sequenceId,
        tracking.contactId,
        {
          openCount: tracking.openCount + 1,
          isFirstOpen,
        }
      );

      // Update sequence stats if this is a sequence email
      if (tracking.sequenceId && tracking.contactId) {
        await updateSequenceStats(
          tracking.sequenceId,
          EmailEventEnum.OPENED,
          tracking.contactId,
          { isUniqueOpen: isFirstOpen }
        );
      }

      logger.info(
        `Recorded email open for hash: ${hash}, isFirstOpen: ${isFirstOpen}`
      );
    } catch (error) {
      logger.error({ err: error }, "Error handling email open");
      throw error;
    }
  }

  async handleLinkClick(hash: string, linkId: string): Promise<string> {
    try {
      const tracking = await this.emailTracking.findWithLink(hash, linkId);

      if (!tracking) {
        logger.warn(`No tracking record found for hash: ${hash}`);
        throw new Error("Invalid tracking data");
      }

      const link = tracking.links[0];
      if (!link) {
        logger.warn(`No link found for id: ${linkId}`);
        throw new Error("Invalid link data");
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

        // Increment click count and update tracking
        await prisma.trackedLink.update({
          where: { id: linkId },
          data: {
            clickCount: {
              increment: 1,
            },
            updatedAt: new Date(),
          },
        });

        // Update tracking record
        await prisma.emailTracking.update({
          where: { id: tracking.id },
          data: {
            clickedAt: tracking.clickedAt ?? new Date(), // Only set clickedAt if it hasn't been set before
            status: EmailTrackingStatusEnum.CLICKED,
            events: {
              create: {
                type: EmailEventEnum.CLICKED,
                sequenceId: tracking.sequenceId,
                contactId: tracking.contactId,
                timestamp: new Date(),
                metadata: {
                  linkId: linkId,
                  originalUrl: link.originalUrl,
                },
              },
            },
          },
        });
      });

      // Update sequence stats
      if (tracking.sequenceId && tracking.contactId) {
        await updateSequenceStats(
          tracking.sequenceId,
          EmailEventEnum.CLICKED,
          tracking.contactId
        );
      }

      logger.info(`Recorded link click for hash: ${hash}, linkId: ${linkId}`);
      return link.originalUrl;
    } catch (error) {
      logger.error({ err: error }, "Error handling link click");
      throw error;
    }
  }

  async trackEmailEvent(data: {
    trackingId: string;
    eventType: EmailEventType;
    metadata?: any;
  }): Promise<void> {
    try {
      const { trackingId, eventType, metadata } = data;

      const tracking = await this.emailTracking.findById(trackingId);

      if (!tracking) {
        throw new Error("Email tracking record not found");
      }

      // Create the event
      await this.emailEvent.create({
        trackingId: tracking.id,
        type: eventType,
        metadata: (metadata || {}) as any,
        timestamp: new Date(),
      });

      // Update tracking status
      await this.emailTracking.setStatus(tracking.id, eventType);

      // Update sequence stats if applicable
      if (tracking.sequenceId && tracking.contactId) {
        await updateSequenceStats(
          tracking.sequenceId,
          eventType,
          tracking.contactId
        );
      }

      logger.info(`Tracked email event: ${eventType} for email: ${trackingId}`);
    } catch (error) {
      logger.error({ err: error }, "Error tracking email event");
      throw error;
    }
  }
}

/**
 * Process-wide singleton — used by the route controller until Phase 6 threads
 * the service through `createApp()`. The composition root constructs its own
 * instance (with the same default repos).
 */
export const trackingService = new TrackingServiceImpl();
