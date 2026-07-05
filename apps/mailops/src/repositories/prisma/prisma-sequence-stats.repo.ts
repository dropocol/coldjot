import { prisma } from "@coldjot/database";
import type {
  SequenceStatsRepository,
  SequenceStatsRecord,
  StatsCounts,
} from "../sequence-stats.repo";

/**
 * NOTE: today's codebase calls `findUnique({ where: { sequenceId } })` on a
 * non-PK field. The interface normalizes this to findFirst; the rate-math
 * consolidation lands in Phase 4.
 */
export class PrismaSequenceStatsRepository implements SequenceStatsRepository {
  async getBySequence(sequenceId: string): Promise<SequenceStatsRecord | null> {
    // lib/tracking/index.ts:537 + lib/stats/index.ts:63
    const row = await prisma.sequenceStats.findFirst({ where: { sequenceId } });
    return row as unknown as SequenceStatsRecord | null;
  }

  async createForSequence(
    sequenceId: string,
    contactId?: string
  ): Promise<SequenceStatsRecord> {
    // lib/tracking/index.ts:434 + lib/stats/index.ts:68 + monitor/service.ts:69
    const row = await prisma.sequenceStats.create({
      data: {
        sequenceId,
        contactId,
        totalEmails: 0,
        sentEmails: 0,
        openedEmails: 0,
        clickedEmails: 0,
        repliedEmails: 0,
        bouncedEmails: 0,
        openRate: 0,
        clickRate: 0,
        replyRate: 0,
        bounceRate: 0,
      } as any,
    });
    return row as unknown as SequenceStatsRecord;
  }

  async updateCounts(sequenceId: string, counts: StatsCounts): Promise<void> {
    // lib/tracking/index.ts:497,601 — increment + recompute rates inline.
    // Phase 4 collapses the divergent rate-math paths into one helper.
    const data: Record<string, number> = {};
    if (counts.totalEmails) data.totalEmails = { increment: counts.totalEmails } as any;
    if (counts.sentEmails) data.sentEmails = { increment: counts.sentEmails } as any;
    if (counts.openedEmails) data.openedEmails = { increment: counts.openedEmails } as any;
    if (counts.clickedEmails) data.clickedEmails = { increment: counts.clickedEmails } as any;
    if (counts.repliedEmails) data.repliedEmails = { increment: counts.repliedEmails } as any;
    if (counts.bouncedEmails) data.bouncedEmails = { increment: counts.bouncedEmails } as any;
    await prisma.sequenceStats.update({ where: { sequenceId }, data });
  }

  async updateRaw(sequenceId: string, data: Record<string, unknown>): Promise<void> {
    // Legacy inline rate-math path — Phase 4 removes this.
    await prisma.sequenceStats.update({ where: { sequenceId }, data: data as any });
  }

  async createWithValues(input: {
    sequenceId: string;
    contactId?: string;
    totalEmails?: number;
    sentEmails?: number;
    openedEmails?: number;
    clickedEmails?: number;
    repliedEmails?: number;
    bouncedEmails?: number;
  }): Promise<SequenceStatsRecord> {
    const row = await prisma.sequenceStats.create({
      data: {
        sequenceId: input.sequenceId,
        contactId: input.contactId,
        totalEmails: input.totalEmails ?? 0,
        sentEmails: input.sentEmails ?? 0,
        openedEmails: input.openedEmails ?? 0,
        clickedEmails: input.clickedEmails ?? 0,
        repliedEmails: input.repliedEmails ?? 0,
        bouncedEmails: input.bouncedEmails ?? 0,
      } as any,
    });
    return row as unknown as SequenceStatsRecord;
  }

  async deleteBySequence(sequenceId: string): Promise<void> {
    // jobs/sequence/helper.ts:221
    await prisma.sequenceStats.deleteMany({ where: { sequenceId } });
  }
}
