// Barrel for the tracking domain.
//
// Phase 4 moved every live tracking concern out of this file:
//   - TrackingServiceImpl (open/click/event/createTracking) →
//     services/domain/tracking.service.ts (4a.2/4a.5)
//   - generateTrackingPixel / calculateRates / wrapLinksWithTracking /
//     addTrackingToEmail → ./pixel.ts / ./stats.ts / ./link-wrap.ts (4a.1)
// The standalone recordEmailOpen / recordLinkClick / trackEmailEvent /
// updateTrackingStats / getEmailEvents / getSequenceEvents fns that used to
// live here were dead (zero callers) and deleted in 4a.3/4a.4.
//
// This file re-exports the service + helpers under the legacy names so existing
// `from "@/lib/tracking"` imports keep resolving. The route controller still
// imports `trackingService` from here — migrated to a direct
// services/domain import in Phase 6.

export {
  TrackingServiceImpl as TrackingService,
  trackingService,
} from "@/services/domain/tracking.service";

export { generateTrackingPixel } from "./pixel";
export { calculateRates } from "./stats";
export {
  addTrackingToEmail,
  wrapLinksWithTracking,
} from "./link-wrap";
