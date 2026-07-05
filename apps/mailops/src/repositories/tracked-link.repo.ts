/**
 * Repository interface for the TrackedLink model.
 * Call sites: lib/tracking (createTrackedLink, recordLinkClick, handleLinkClick).
 */

export interface TrackedLinkRecord {
  id: string;
  emailTrackingId: string;
  originalUrl: string;
  clickCount: number;
}

export interface TrackedLinkWithTracking extends TrackedLinkRecord {
  emailTracking: {
    id: string;
    hash: string;
    sequenceId: string;
    contactId: string;
  };
}

export interface TrackedLinkRepository {
  /** Create a tracked link for an outgoing email. */
  create(input: {
    emailTrackingId: string;
    originalUrl: string;
  }): Promise<TrackedLinkRecord>;
  /** Find a link + its parent tracking (click handling). */
  findWithTracking(linkId: string): Promise<TrackedLinkWithTracking | null>;
  /** Increment click count (called inside a transaction by callers). */
  incrementClickCount(linkId: string, at: Date): Promise<void>;
}
