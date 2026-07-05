/**
 * In-memory fake for `TrackedLinkRepository`.
 */
import type {
  TrackedLinkRepository,
  TrackedLinkRecord,
  TrackedLinkWithTracking,
} from "@/repositories/tracked-link.repo";
import { FakeBase, MemoryStore, genId } from "./base";

export class FakeTrackedLinkRepository
  extends FakeBase
  implements TrackedLinkRepository
{
  store = new MemoryStore<TrackedLinkRecord & { updatedAt?: Date }>();

  async create(input: {
    emailTrackingId: string;
    originalUrl: string;
  }): Promise<TrackedLinkRecord> {
    this.record("create", [input]);
    const row: TrackedLinkRecord = {
      id: genId("link"),
      emailTrackingId: input.emailTrackingId,
      originalUrl: input.originalUrl,
      clickCount: 0,
    };
    this.store.set(row);
    return row;
  }

  async findWithTracking(linkId: string): Promise<TrackedLinkWithTracking | null> {
    this.record("findWithTracking", [linkId]);
    const link = this.store.get(linkId);
    if (!link) return null;
    return {
      ...link,
      emailTracking: {
        id: link.emailTrackingId,
        hash: "",
        sequenceId: "",
        contactId: "",
      },
    };
  }

  /** Bind a tracking row's hash/sequence/contact onto links for findWithTracking. */
  bindTracking(id: string, patch: Partial<{ hash: string; sequenceId: string; contactId: string }>): void {
    const link = this.store.get(id);
    if (!link) return;
    // Stored inline so findWithTracking can read them; cast to the wider shape.
    Object.assign(link, patch);
  }

  async incrementClickCount(linkId: string, at: Date): Promise<void> {
    this.record("incrementClickCount", [linkId, at]);
    const link = this.store.get(linkId);
    if (!link) return;
    link.clickCount += 1;
    link.updatedAt = at;
  }

  override reset(): void {
    super.reset();
    this.store.clear();
  }
}
