/**
 * In-memory fake for `LinkClickRepository`.
 */
import type {
  LinkClickRepository,
  LinkClickRecord,
} from "@/repositories/link-click.repo";
import { FakeBase, MemoryStore, genId } from "./base";

export class FakeLinkClickRepository
  extends FakeBase
  implements LinkClickRepository
{
  store = new MemoryStore<LinkClickRecord>();

  async create(trackedLinkId: string, timestamp: Date): Promise<LinkClickRecord> {
    this.record("create", [trackedLinkId, timestamp]);
    const row: LinkClickRecord = {
      id: genId("click"),
      trackedLinkId,
      timestamp,
    };
    this.store.set(row);
    return row;
  }

  override reset(): void {
    super.reset();
    this.store.clear();
  }
}
