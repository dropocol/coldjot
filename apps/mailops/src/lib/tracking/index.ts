import {
  EmailTrackingMetadata,
  EmailTracking,
  EmailTrackingEnum,
  EmailEventEnum,
  EmailTrackingStatusEnum,
  AppUrlEnum,
} from "@coldjot/types";
import { nanoid } from "nanoid";
import { prisma } from "@coldjot/database";
import { getBaseUrl } from "@/utils";
import { updateSequenceStats } from "@/lib/stats";
import type { Prisma } from "@prisma/client";
import { EmailEventType } from "@coldjot/types";
import { logger } from "@/lib/log";
import { ProcessingJobEnum } from "@coldjot/types";
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
      metadata: {
        email: metadata.email,
        userId: metadata.userId,
        sequenceId: metadata.sequenceId,
        stepId: metadata.stepId,
        contactId: metadata.contactId,
      },
      openCount: 0,
      createdAt: new Date(),
    };

    const trackingEvent = await prisma.emailTracking.create({
      data: eventData,
    });

    const tracking: EmailTracking = {
      id: trackingEvent.id,
      hash,
      metadata: { ...metadata, hash },
      type: EmailTrackingEnum.SEQUENCE,
      pixel: generateTrackingPixel(hash),
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
    const emailTracking = await prisma.emailTracking.findUnique({
      where: { hash },
    });

    if (!emailTracking) {
      throw new Error("No tracking event found");
    }

    // Check for existing open event
    const existingOpenEvent = await prisma.emailEvent.findFirst({
      where: {
        trackingId: emailTracking.id,
        type: EmailEventEnum.OPENED,
      },
    });

    // Always increment the open count on the tracking event
    await prisma.emailTracking.update({
      where: { hash },
      data: {
        status: "opened",
        openCount: {
          increment: 1,
        },
        openedAt: existingOpenEvent ? undefined : new Date(), // Only set openedAt for first open
      },
    });

    // Only create an email event and update stats if this is the first open
    if (!existingOpenEvent) {
      await prisma.emailEvent.create({
        data: {
          trackingId: emailTracking.id,
          type: EmailEventEnum.OPENED,
          sequenceId: emailTracking.sequenceId,
          contactId: emailTracking.contactId,
          metadata: {
            isFirstOpen: true,
            openCount: 1,
          },
        },
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
    const trackedLink = await prisma.trackedLink.findUnique({
      where: { id: linkId },
      include: {
        emailTracking: true,
      },
    });

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
    const trackedLink = await prisma.trackedLink.create({
      data: {
        emailTrackingId,
        originalUrl,
        clickCount: 0,
      },
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

export async function addTrackingToEmail(
  content: string,
  tracking: EmailTracking
): Promise<string> {
  try {
    if (!content || !tracking) {
      throw new Error("Content and tracking information are required");
    }

    let trackedContent = content;

    logger.info("🔄 Adding tracking to email content");

    if (tracking.wrappedLinks) {
      trackedContent = await wrapLinksWithTracking(
        trackedContent,
        tracking.hash!,
        tracking.id!
      );
    }

    // Add development tracking link
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
  } catch (error) {
    console.error("Error adding tracking to email:", error);
    throw new Error(
      `Failed to add tracking to email: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

function generateTrackingPixel(hash: string): string {
  try {
    if (!hash) {
      throw new Error("Hash is required for tracking pixel generation");
    }

    const baseUrl = getBaseUrl(AppUrlEnum.TRACKING);
    const trackingUrl = new URL(`${baseUrl}/api/track/${hash}.png`);
    return `<img src="${trackingUrl.toString()}" alt="" style="display:none" width="1" height="1" />`;
  } catch (error) {
    console.error("Error generating tracking pixel:", error);
    throw new Error(
      `Failed to generate tracking pixel: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

async function wrapLinksWithTracking(
  content: string,
  hash: string,
  trackingId: string
): Promise<string> {
  try {
    console.log("content", content);
    console.log("hash", hash);
    console.log("trackingId", trackingId);

    if (!content || !hash || !trackingId) {
      throw new Error(
        "Content, hash, and tracking ID are required for link tracking"
      );
    }

    const baseUrl = getBaseUrl(AppUrlEnum.TRACKING);
    const trackingBaseUrl = `${baseUrl}/api/track/${hash}/click`;

    // Use async replace to handle link creation
    const promises: Promise<string>[] = [];
    const matches: { match: string; url: string }[] = [];

    // Find all links and store them
    content.replace(
      /<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1/gi,
      (match, quote, url) => {
        if (url.trim()) {
          matches.push({ match, url });
        }
        return match;
      }
    );

    // Create tracked links for all URLs
    for (const { match, url } of matches) {
      const linkId = await createTrackedLink(trackingId, url);
      const trackingUrl = new URL(trackingBaseUrl);
      trackingUrl.searchParams.set("lid", linkId); // Use link ID instead of URL
      content = content.replace(match, `<a href="${trackingUrl.toString()}"`);
    }

    return content;
  } catch (error) {
    console.error("Error in link tracking:", error);
    throw new Error(
      `Failed to wrap links with tracking: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

export async function getEmailEvents(trackingId: string) {
  return await prisma.emailEvent.findMany({
    where: { trackingId },
    orderBy: { timestamp: "desc" },
  });
}

export async function getSequenceEvents(
  sequenceId: string,
  timeframe?: { start: Date; end: Date }
) {
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
export interface EventMetadata {
  userAgent?: string;
  ipAddress?: string;
  location?: string;
  deviceType?: string;
  replyMessageId?: string;
  bounceReason?: string;
  threadId?: string;
  messageId?: string;
  from?: string;
  snippet?: string;
  timestamp?: string;
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
  metadata?: EventMetadata,
  trackingData?: EmailTrackingMetadata
) {
  try {
    const sequenceId = trackingData?.sequenceId;

    if (!sequenceId) {
      throw new Error("Sequence ID is required for tracking");
    }

    // Check for existing event of this type for this email (except for clicks)
    if (type !== EmailEventEnum.CLICKED) {
      const existingEvent = await prisma.emailEvent.findFirst({
        where: {
          trackingId,
          type,
          sequenceId,
        },
      });

      if (existingEvent) {
        console.log(`Event ${type} already recorded for email ${trackingId}`);
        return existingEvent;
      }
    }

    // Create the event
    const event = await prisma.emailEvent.create({
      data: {
        trackingId,
        type,
        sequenceId,
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null,
        contactId: trackingData?.contactId,
      },
    });

    // Update sequence stats
    const stats = await prisma.sequenceStats.findUnique({
      where: { sequenceId: trackingData?.sequenceId },
    });

    if (!stats) {
      // Create initial stats if they don't exist
      await prisma.sequenceStats.create({
        data: {
          sequenceId: sequenceId,
          totalEmails: type === EmailEventEnum.SENT ? 1 : 0,
          sentEmails: type === EmailEventEnum.SENT ? 1 : 0,
          openedEmails: type === EmailEventEnum.OPENED ? 1 : 0,
          clickedEmails: type === EmailEventEnum.CLICKED ? 1 : 0,
          repliedEmails: type === EmailEventEnum.REPLIED ? 1 : 0,
          bouncedEmails: type === EmailEventEnum.BOUNCED ? 1 : 0,
          contactId: trackingData?.contactId,
        },
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
    await prisma.sequenceStats.update({
      where: { sequenceId },
      data: updates,
    });

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
const calculateRates = (stats: {
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
  const stats = await prisma.sequenceStats.findFirst({
    where: { sequenceId },
  });

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
      const sentRates = calculateRates({
        ...stats,
        sentEmails: (stats.sentEmails ?? 0) + 1,
      });
      Object.assign(updates, sentRates);
      break;

    case EmailEventEnum.OPENED:
      updates.openedEmails = (stats.openedEmails ?? 0) + 1;
      const openRates = calculateRates({
        ...stats,
        openedEmails: (stats.openedEmails ?? 0) + 1,
      });
      updates.openRate = openRates.openRate;
      break;

    case EmailEventEnum.CLICKED:
      updates.clickedEmails = (stats.clickedEmails ?? 0) + 1;
      const clickRates = calculateRates({
        ...stats,
        clickedEmails: (stats.clickedEmails ?? 0) + 1,
      });
      updates.clickRate = clickRates.clickRate;
      break;

    case EmailEventEnum.REPLIED:
      updates.repliedEmails = (stats.repliedEmails ?? 0) + 1;
      const replyRates = calculateRates({
        ...stats,
        repliedEmails: (stats.repliedEmails ?? 0) + 1,
      });
      updates.replyRate = replyRates.replyRate;
      break;

    case EmailEventEnum.BOUNCED:
      updates.bouncedEmails = (stats.bouncedEmails ?? 0) + 1;
      const bounceRates = calculateRates({
        ...stats,
        bouncedEmails: (stats.bouncedEmails ?? 0) + 1,
      });
      updates.bounceRate = bounceRates.bounceRate;
      break;
  }

  // Update stats atomically
  return prisma.sequenceStats.update({
    where: { sequenceId },
    data: updates,
  });
}

export class TrackingService {
  async handleEmailOpen(hash: string): Promise<void> {
    try {
      const tracking = await prisma.emailTracking.findUnique({
        where: { hash },
        include: {
          events: {
            where: {
              type: EmailEventEnum.OPENED,
            },
          },
        },
      });

      if (!tracking) {
        logger.warn(`No tracking record found for hash: ${hash}`);
        return;
      }

      const isFirstOpen = tracking.events.length === 0;

      // Always increment the open count and update timestamps
      await prisma.emailTracking.update({
        where: { hash },
        data: {
          openCount: {
            increment: 1,
          },
          openedAt: tracking.openedAt ?? new Date(), // Only set openedAt if it hasn't been set before
          status: EmailTrackingStatusEnum.OPENED,
          events: {
            create: {
              type: EmailEventEnum.OPENED,
              sequenceId: tracking.sequenceId,
              contactId: tracking.contactId,
              metadata: {
                openCount: tracking.openCount + 1,
                isFirstOpen,
              },
            },
          },
        },
      });

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
      logger.error("Error handling email open:", error);
      throw error;
    }
  }

  async handleLinkClick(hash: string, linkId: string): Promise<string> {
    try {
      const tracking = await prisma.emailTracking.findUnique({
        where: { hash },
        include: {
          links: {
            where: {
              id: linkId,
            },
          },
        },
      });

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
      logger.error("Error handling link click:", error);
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

      const tracking = await prisma.emailTracking.findUnique({
        where: { id: trackingId },
      });

      if (!tracking) {
        throw new Error("Email tracking record not found");
      }

      // Create the event
      await prisma.emailEvent.create({
        data: {
          trackingId: tracking.id,
          type: eventType,
          metadata: metadata || {},
          timestamp: new Date(),
        },
      });

      // Update tracking status
      await prisma.emailTracking.update({
        where: { id: tracking.id },
        data: {
          status: eventType,
        },
      });

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
      logger.error("Error tracking email event:", error);
      throw error;
    }
  }
}
export const trackingService = new TrackingService();
