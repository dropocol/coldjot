import type {
  EmailEventType,
  EmailEventMetadata,
} from "@coldjot/types";

/**
 * Domain service interface — what tracking *does*, not how.
 * Phase 4 replaces the current TrackingService impl behind this contract.
 */
export interface TrackingService {
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
