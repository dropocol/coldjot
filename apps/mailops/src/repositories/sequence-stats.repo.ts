/**
 * Repository interface for the SequenceStats model.
 *
 * NOTE: today's codebase calls `findUnique({ where: { sequenceId } })` even
 * though `sequenceId` is not the PK (latent bug). The interface normalizes
 * this to `getBySequence` (semantically a findFirst in the Prisma impl). Phase
 * 4 consolidates the divergent rate-math paths.
 */

export interface SequenceStatsRecord {
  sequenceId: string;
  totalEmails: number;
  sentEmails: number;
  openedEmails: number;
  clickedEmails: number;
  repliedEmails: number;
  bouncedEmails: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
  contactId?: string | null;
}

export interface StatsCounts {
  totalEmails?: number;
  sentEmails?: number;
  openedEmails?: number;
  clickedEmails?: number;
  repliedEmails?: number;
  bouncedEmails?: number;
}

export interface SequenceStatsRepository {
  /** Fetch stats for a sequence (findFirst by sequenceId). */
  getBySequence(sequenceId: string): Promise<SequenceStatsRecord | null>;
  /** Initialize a zeroed stats row. */
  createForSequence(sequenceId: string, contactId?: string): Promise<SequenceStatsRecord>;
  /** Increment counters + recompute rates. */
  updateCounts(sequenceId: string, counts: StatsCounts): Promise<void>;
  /** Bulk delete by sequenceId (sequence reset). */
  deleteBySequence(sequenceId: string): Promise<void>;
}
