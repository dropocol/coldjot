/**
 * Repository interface for the LinkClick model.
 * Call sites: lib/tracking (recordLinkClick, handleLinkClick).
 */

export interface LinkClickRecord {
  id: string;
  trackedLinkId: string;
  timestamp: Date;
}

export interface LinkClickRepository {
  /** Record a click event on a tracked link (inside a transaction). */
  create(trackedLinkId: string, timestamp: Date): Promise<LinkClickRecord>;
}
