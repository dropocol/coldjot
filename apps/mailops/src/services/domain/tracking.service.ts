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
import { prisma, type Db } from "@coldjot/database";
import { generateTrackingPixel } from "@/lib/tracking/pixel";

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

// Implementation (Phase 4a.2)

/**
 * Live `TrackingServiceImpl` — the canonical open/click/event path.
 *
 * The route controller calls these three methods. The duplicate standalone
 * functions that used to live in `lib/tracking/index.ts` are deleted in 4a.4
 * (open / click / generic-event standalones) and 4a.3 (stats standalones).
 *
 * mailops v2: data access goes through the `db` client's domain extension
 * methods (`db.emailTracking.createPending`, `db.emailEvent.record`, etc.).
 * The `handleLinkClick` transaction uses raw Prisma on the `tx` client
 * (extension methods aren't available inside `$transaction` callbacks).
 */
export class TrackingServiceImpl implements TrackingService {
  constructor(private readonly db: Db = prisma) {}

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

    const trackingEvent = await this.db.emailTracking.createPending({
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
      const tracking = await this.db.emailTracking.findWithOpenEvents(hash);

      if (!tracking) {
        logger.warn(`No tracking record found for hash: ${hash}`);
        return;
      }

      const isFirstOpen = tracking.events.length === 0;

      // Always increment the open count and update timestamps
      await this.db.emailTracking.recordOpen(
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
      const tracking = await this.db.emailTracking.findWithLink(hash, linkId);

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

      const tracking = await this.db.emailTracking.findById(trackingId);

      if (!tracking) {
        throw new Error("Email tracking record not found");
      }

      // Create the event (named `record` on the extension to avoid shadowing Prisma's `create`)
      await this.db.emailEvent.record({
        trackingId: tracking.id,
        type: eventType,
        metadata: (metadata || {}) as any,
        timestamp: new Date(),
      });

      // Update tracking status
      await this.db.emailTracking.setStatus(tracking.id, eventType);

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
 * Process-wide singleton — used by the route controller until sub-plan 2
 * threads the service through the composition root.
 */
export const trackingService = new TrackingServiceImpl(prisma);
