/**
 * In-memory fake for `EmailEventRepository`.
 */
import type {
  EmailEventRepository,
  EmailEventRecord,
  CreateEventInput,
} from "@/repositories/email-event.repo";
import type { EmailEventEnum } from "@coldjot/types";
import { FakeBase, MemoryStore, genId } from "./base";

export class FakeEmailEventRepository
  extends FakeBase
  implements EmailEventRepository
{
  store = new MemoryStore<EmailEventRecord>();

  async create(input: CreateEventInput): Promise<EmailEventRecord> {
    this.record("create", [input]);
    const row: EmailEventRecord = {
      id: genId("evt"),
      trackingId: input.trackingId,
      type: input.type,
      sequenceId: input.sequenceId ?? "",
      contactId: input.contactId ?? "",
      metadata: (input.metadata ?? {}) as EmailEventRecord["metadata"],
      timestamp: input.timestamp ?? new Date(),
    };
    this.store.set(row);
    return row;
  }

  async findFirstByTrackingAndType(
    trackingId: string,
    type: EmailEventEnum
  ): Promise<EmailEventRecord | null> {
    this.record("findFirstByTrackingAndType", [trackingId, type]);
    return this.store.filter((e) => e.trackingId === trackingId && e.type === type)[0] ?? null;
  }

  async findFirstByTrackingTypeSequence(
    trackingId: string,
    type: EmailEventEnum,
    sequenceId: string
  ): Promise<EmailEventRecord | null> {
    this.record("findFirstByTrackingTypeSequence", [trackingId, type, sequenceId]);
    return (
      this.store.filter(
        (e) => e.trackingId === trackingId && e.type === type && e.sequenceId === sequenceId
      )[0] ?? null
    );
  }

  async findFirstBySequenceContactType(
    sequenceId: string,
    contactId: string,
    type: EmailEventEnum
  ): Promise<EmailEventRecord | null> {
    this.record("findFirstBySequenceContactType", [sequenceId, contactId, type]);
    return (
      this.store.filter(
        (e) => e.sequenceId === sequenceId && e.contactId === contactId && e.type === type
      )[0] ?? null
    );
  }

  async countBySequenceContactType(
    sequenceId: string,
    contactId: string,
    type: EmailEventEnum
  ): Promise<number> {
    this.record("countBySequenceContactType", [sequenceId, contactId, type]);
    return this.store.filter(
      (e) => e.sequenceId === sequenceId && e.contactId === contactId && e.type === type
    ).length;
  }

  async existsBySequenceContactInTypes(
    sequenceId: string,
    contactId: string,
    types: EmailEventEnum[]
  ): Promise<boolean> {
    this.record("existsBySequenceContactInTypes", [sequenceId, contactId, types]);
    return (
      this.store.filter(
        (e) =>
          e.sequenceId === sequenceId &&
          e.contactId === contactId &&
          types.includes(e.type)
      ).length > 0
    );
  }

  async listByTracking(trackingId: string): Promise<EmailEventRecord[]> {
    this.record("listByTracking", [trackingId]);
    return this.store.filter((e) => e.trackingId === trackingId);
  }

  async deleteBySequence(sequenceId: string): Promise<void> {
    this.record("deleteBySequence", [sequenceId]);
    for (const e of this.store.filter((e) => e.sequenceId === sequenceId)) {
      this.store.rows.delete(e.id);
    }
  }

  override reset(): void {
    super.reset();
    this.store.clear();
  }
}
