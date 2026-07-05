/**
 * Rate-math helper — the single source of truth for sequence-stats rate
 * calculations.
 *
 * Extracted from lib/tracking/index.ts (Phase 4a.1). The legacy inline math in
 * the dead standalone `trackEmailEvent`/`updateTrackingStats` paths disagreed
 * with this; those paths are deleted in 4a.3 and this becomes the only math.
 *
 * NOTE: the *live* stats path is `TrackingServiceImpl → lib/stats.updateSequenceStats`,
 * which has its own rate logic. This helper is kept for any future caller that
 * wants the same shape; reconciling it with `lib/stats` is a Phase 7 cleanup.
 */
export interface RateInputs {
  totalEmails: number | null;
  sentEmails: number | null;
  openedEmails: number | null;
  clickedEmails: number | null;
  repliedEmails: number | null;
  bouncedEmails: number | null;
}

export interface RateOutputs {
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
}

/** Safe rate calculation. Denominator is `max(sentEmails + 1, 1)` for all types. */
export function calculateRates(stats: RateInputs): RateOutputs {
  const denominator = Math.max((stats.sentEmails ?? 0) + 1, 1);
  return {
    openRate: ((stats.openedEmails ?? 0) / denominator) * 100,
    clickRate: ((stats.clickedEmails ?? 0) / denominator) * 100,
    replyRate: ((stats.repliedEmails ?? 0) / denominator) * 100,
    bounceRate: ((stats.bouncedEmails ?? 0) / denominator) * 100,
  };
}
