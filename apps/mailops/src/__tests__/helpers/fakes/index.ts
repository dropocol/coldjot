/**
 * Barrel for the Phase 7 in-memory fakes + stubs.
 *
 * Per-repo fakes implement the `*Repository` interfaces with in-memory Maps;
 * `FakeMailTransport` + `FakeInboxSource` implement the adapter interfaces;
 * `FakeJobManager` + `FakeRateLimitService` are call-recording stubs for the
 * infra collaborators.
 */
export { FakeBase, MemoryStore, genId } from "./base";
export type { RecordedCall } from "./base";

export { FakeEmailTrackingRepository } from "./email-tracking.fake";
export { FakeEmailEventRepository } from "./email-event.fake";
export { FakeTrackedLinkRepository } from "./tracked-link.fake";
export { FakeLinkClickRepository } from "./link-click.fake";

export {
  FakeSequenceRepository,
  FakeSequenceStepRepository,
  FakeSequenceContactRepository,
  FakeSequenceStatsRepository,
  FakeBusinessHoursRepository,
} from "./sequence.fake";

export {
  FakeEmailThreadRepository,
  FakeProcessedMessageRepository,
  FakeEmailWatchRepository,
  FakeEmailWatchHistoryRepository,
  FakeMailboxRepository,
  FakeContactRepository,
  FakeTemplateRepository,
  FakeListRepository,
  FakeListSyncRecordRepository,
} from "./inbox-sync-repos.fake";

export { FakeMailTransport, FakeInboxSource } from "./mail-transport.fake";
export { FakeJobManager, FakeRateLimitService } from "./stubs";
