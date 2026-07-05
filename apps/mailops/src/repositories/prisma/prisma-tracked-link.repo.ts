import { prisma } from "@coldjot/database";
import type {
  TrackedLinkRepository,
  TrackedLinkRecord,
  TrackedLinkWithTracking,
} from "../tracked-link.repo";

export class PrismaTrackedLinkRepository implements TrackedLinkRepository {
  async create(input: {
    emailTrackingId: string;
    originalUrl: string;
  }): Promise<TrackedLinkRecord> {
    // lib/tracking/index.ts:210
    const row = await prisma.trackedLink.create({
      data: {
        emailTrackingId: input.emailTrackingId,
        originalUrl: input.originalUrl,
        clickCount: 0,
      },
    });
    return row as unknown as TrackedLinkRecord;
  }

  async findWithTracking(linkId: string): Promise<TrackedLinkWithTracking | null> {
    // lib/tracking/index.ts:154
    const row = await prisma.trackedLink.findUnique({
      where: { id: linkId },
      include: { emailTracking: true },
    });
    return row as unknown as TrackedLinkWithTracking | null;
  }

  async incrementClickCount(linkId: string, at: Date): Promise<void> {
    // lib/tracking/index.ts:176,705
    await prisma.trackedLink.update({
      where: { id: linkId },
      data: { clickCount: { increment: 1 }, updatedAt: at },
    });
  }
}
