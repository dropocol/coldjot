/**
 * In-memory fake for `EmailTrackingRepository`. Backs the
 * `TrackingServiceImpl` + `SendEmailServiceImpl` unit tests.
 */
import type {
  EmailTrackingRepository,
  EmailTrackingRecord,
  CreatePendingInput,
  SentDetails,
  EmailTrackingWithOpenEvents,
  EmailTrackingWithLink,
} from "@/repositories/email-tracking.repo";
import type { EmailEventEnum } from "@coldjot/types";
import { FakeBase, MemoryStore, genId } from "./base";

export class FakeEmailTrackingRepository
  extends FakeBase
  implements EmailTrackingRepository
{
  store = new MemoryStore<EmailTrackingRecord>();
  /** Nested events live here too (markSent/recordOpen/recordClick write them). */
  events = new MemoryStore<{
    id: string;
    trackingId: string;
    type: EmailEventEnum;
  }>();

  async createPending(input: CreatePendingInput): Promise<EmailTrackingRecord> {
    this.record("createPending", [input]);
    const row: EmailTrackingRecord = {
      id: input.id ?? genId("track"),
      hash: input.hash,
      status: input.status ?? "pending",
      messageId: input.messageId ?? null,
      threadId: input.threadId ?? null,
      subject: input.subject ?? null,
      userId: input.userId,
      sequenceId: input.sequenceId,
      stepId: input.stepId,
      contactId: input.contactId,
      openCount: 0,
      openedAt: null,
      clickedAt: null,
      jobId: input.jobId ?? null,
      metadata: input.metadata,
    };
    this.store.set(row);
    this.store.index("hash", row.hash, row.id);
    return row;
  }

  async findByHash(hash: string): Promise<EmailTrackingRecord | null> {
    this.record("findByHash", [hash]);
    return this.store.findByIndexed("hash", hash) ?? null;
  }

  async findSentByJobId(jobId: string): Promise<{ id: string } | null> {
    this.record("findSentByJobId", [jobId]);
    const row = this.store.filter((r) => r.jobId === jobId && r.status === "SENT")[0];
    return row ? { id: row.id } : null;
  }

  async findWithOpenEvents(hash: string): Promise<EmailTrackingWithOpenEvents | null> {
    this.record("findWithOpenEvents", [hash]);
    const base = this.store.findByIndexed("hash", hash);
    if (!base) return null;
    const events = this.events.filter((e) => e.trackingId === base.id && e.type === ("OPENED" as EmailEventEnum));
    return { ...base, events: events.map((e) => ({ id: e.id })) };
  }

  async findWithLink(hash: string, linkId: string): Promise<EmailTrackingWithLink | null> {
    this.record("findWithLink", [hash, linkId]);
    const base = this.store.findByIndexed("hash", hash);
    if (!base) return null;
    // Links are seeded via FakeTrackedLink; here we just confirm existence.
    return { ...base, links: [{ id: linkId, originalUrl: "" }] };
  }

  async findById(id: string): Promise<EmailTrackingRecord | null> {
    this.record("findById", [id]);
    return this.store.get(id) ?? null;
  }

  async countByThread(threadId: string): Promise<number> {
    this.record("countByThread", [threadId]);
    return this.store.filter((r) => r.threadId === threadId).length;
  }

  async findEarliestSubjectInThread(threadId: string): Promise<string | null> {
    this.record("findEarliestSubjectInThread", [threadId]);
    const rows = this.store.filter((r) => r.threadId === threadId && !!r.subject);
    rows.sort((a, b) => (a.id < b.id ? -1 : 1));
    return rows[0]?.subject ?? null;
  }

  async markSent(
    trackingId: string,
    details: SentDetails,
    subject: string,
    sequenceId: string,
    contactId: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    this.record("markSent", [trackingId, details, subject, sequenceId, contactId, metadata]);
    const row = this.store.get(trackingId);
    if (!row) throw new Error(`FakeEmailTracking: markSent missing ${trackingId}`);
    row.status = "SENT";
    row.messageId = details.messageId ?? null;
    row.threadId = details.threadId ?? null;
    row.subject = subject;
    // The nested SENT event:
    this.events.set({
      id: genId("evt"),
      trackingId,
      type: "SENT" as EmailEventEnum,
    });
  }

  async recordOpen(
    hash: string,
    sequenceId: string,
    contactId: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    this.record("recordOpen", [hash, sequenceId, contactId, metadata]);
    const row = this.store.findByIndexed("hash", hash);
    if (!row) throw new Error(`FakeEmailTracking: recordOpen missing ${hash}`);
    row.openCount += 1;
    row.openedAt = new Date();
    row.status = "OPENED";
    this.events.set({
      id: genId("evt"),
      trackingId: row.id,
      type: "OPENED" as EmailEventEnum,
    });
  }

  async incrementOpenStatus(hash: string, setOpenedAt: boolean): Promise<void> {
    this.record("incrementOpenStatus", [hash, setOpenedAt]);
    const row = this.store.findByIndexed("hash", hash);
    if (!row) return;
    row.openCount += 1;
    if (setOpenedAt) row.openedAt = new Date();
    row.status = "opened";
  }

  async recordClick(
    trackingId: string,
    sequenceId: string,
    contactId: string,
    timestamp: Date,
    metadata: Record<string, unknown>
  ): Promise<void> {
    this.record("recordClick", [trackingId, sequenceId, contactId, timestamp, metadata]);
    const row = this.store.get(trackingId);
    if (!row) throw new Error(`FakeEmailTracking: recordClick missing ${trackingId}`);
    row.clickedAt = timestamp;
    row.status = "CLICKED";
    this.events.set({
      id: genId("evt"),
      trackingId,
      type: "CLICKED" as EmailEventEnum,
    });
  }

  async setStatus(id: string, status: EmailEventEnum | string): Promise<void> {
    this.record("setStatus", [id, status]);
    const row = this.store.get(id);
    if (row) row.status = status;
  }

  async deleteBySequence(sequenceId: string): Promise<void> {
    this.record("deleteBySequence", [sequenceId]);
    for (const row of this.store.filter((r) => r.sequenceId === sequenceId)) {
      this.store.rows.delete(row.id);
    }
  }

  override reset(): void {
    super.reset();
    this.store.clear();
    this.events.clear();
  }
}
