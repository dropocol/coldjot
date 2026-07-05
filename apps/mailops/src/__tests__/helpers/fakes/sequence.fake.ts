/**
 * In-memory fakes for the sequence aggregate: SequenceRepository,
 * SequenceStepRepository, SequenceContactRepository, SequenceStatsRepository,
 * BusinessHoursRepository. Grouped in one file because the launch/tick tests
 * seed them together and the row shapes interrelate.
 */
import type { BusinessHours } from "@coldjot/types";

import type {
  SequenceRepository,
  SequenceRecord,
  SequenceWithLaunchGraph,
  SequenceWithDetails,
} from "@/repositories/sequence.repo";
import type {
  SequenceStepRepository,
  SequenceStepRecord,
} from "@/repositories/sequence-step.repo";
import type {
  SequenceContactRepository,
  SequenceContactRecord,
  UpdateStatusInput,
  DueContactGraph,
  NewContactGraph,
} from "@/repositories/sequence-contact.repo";
import type {
  SequenceStatsRepository,
  SequenceStatsRecord,
  StatsCounts,
} from "@/repositories/sequence-stats.repo";
import type {
  BusinessHoursRepository,
} from "@/repositories/business-hours.repo";

import { FakeBase, MemoryStore, genId } from "./base";

// ---- SequenceRepository ---------------------------------------------------

export class FakeSequenceRepository
  extends FakeBase
  implements SequenceRepository
{
  store = new MemoryStore<
    SequenceRecord & {
      steps?: Array<{ id: string; order: number }>;
      contacts?: SequenceWithLaunchGraph["contacts"];
      businessHours?: BusinessHours | null;
      sequenceMailboxId?: string;
      sequenceMailbox?: { id: string } | null;
    }
  >();

  async findByIdForUser(id: string, userId: string): Promise<SequenceRecord | null> {
    this.record("findByIdForUser", [id, userId]);
    const row = this.store.get(id);
    if (!row || row.userId !== userId) return null;
    return row;
  }

  async findForLaunch(
    id: string,
    userId: string,
    excludeStatuses: string[]
  ): Promise<SequenceWithLaunchGraph | null> {
    this.record("findForLaunch", [id, userId, excludeStatuses]);
    const row = this.store.get(id);
    if (!row || row.userId !== userId) return null;
    const contacts = (row.contacts ?? []).filter(
      (c) => !excludeStatuses.includes(c.status)
    );
    return {
      ...row,
      businessHours: row.businessHours ?? null,
      steps: row.steps ?? [],
      contacts,
    };
  }

  async findWithDetails(id: string): Promise<SequenceWithDetails | null> {
    this.record("findWithDetails", [id]);
    const row = this.store.get(id);
    if (!row) return null;
    return {
      ...row,
      sequenceMailboxId: row.sequenceMailboxId ?? "",
      sequenceMailbox: row.sequenceMailbox ?? null,
      businessHours: row.businessHours ?? null,
      steps: (row.steps ?? []).map((s) => ({
        id: s.id,
        sequenceId: id,
        order: s.order,
        stepType: "AUTOMATED_EMAIL",
        priority: null as any,
        timing: "IMMEDIATE",
        delayAmount: null,
        delayUnit: null,
        subject: null,
        content: null,
        includeSignature: null,
        note: null,
        previousStepId: null,
        replyToThread: false,
        templateId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    };
  }

  async findWithBusinessHours(id: string): Promise<{ businessHours: BusinessHours | null } | null> {
    this.record("findWithBusinessHours", [id]);
    const row = this.store.get(id);
    return row ? { businessHours: row.businessHours ?? null } : null;
  }

  async setStatus(id: string, status: string): Promise<void> {
    this.record("setStatus", [id, status]);
    const row = this.store.get(id);
    if (row) row.status = status;
  }

  async resetToDraft(id: string): Promise<void> {
    this.record("resetToDraft", [id]);
    const row = this.store.get(id);
    if (row) {
      row.status = "draft";
      (row as any).testMode = false;
      (row as any).disableSending = false;
    }
  }

  override reset(): void {
    super.reset();
    this.store.clear();
  }
}

// ---- SequenceStepRepository -----------------------------------------------

export class FakeSequenceStepRepository
  extends FakeBase
  implements SequenceStepRepository
{
  store = new MemoryStore<SequenceStepRecord>();

  async findBySequenceAndOrder(sequenceId: string, order: number): Promise<SequenceStepRecord | null> {
    this.record("findBySequenceAndOrder", [sequenceId, order]);
    return (
      this.store.filter((s) => s.sequenceId === sequenceId && s.order === order)[0] ?? null
    );
  }

  async findWithSequenceMeta(stepId: string): Promise<(SequenceStepRecord & { sequence: { id: string; userId: string; status: string; name: string } }) | null> {
    this.record("findWithSequenceMeta", [stepId]);
    const step = this.store.get(stepId);
    if (!step) return null;
    return { ...step, sequence: { id: step.sequenceId, userId: "", status: "", name: "" } };
  }

  async countInSequence(sequenceId: string): Promise<number> {
    this.record("countInSequence", [sequenceId]);
    return this.store.filter((s) => s.sequenceId === sequenceId).length;
  }

  async listBySequence(sequenceId: string): Promise<SequenceStepRecord[]> {
    this.record("listBySequence", [sequenceId]);
    const steps = this.store.filter((s) => s.sequenceId === sequenceId);
    steps.sort((a, b) => a.order - b.order);
    return steps;
  }

  override reset(): void {
    super.reset();
    this.store.clear();
  }
}

// ---- SequenceContactRepository --------------------------------------------

export class FakeSequenceContactRepository
  extends FakeBase
  implements SequenceContactRepository
{
  store = new MemoryStore<SequenceContactRecord>();
  /** Composite unique: `seqId|contactId` → id */
  private composite = new Map<string, string>();

  private compositeKey(sequenceId: string, contactId: string): string {
    return `${sequenceId}|${contactId}`;
  }

  async findBySequenceAndContact(
    sequenceId: string,
    contactId: string
  ): Promise<SequenceContactRecord | null> {
    this.record("findBySequenceAndContact", [sequenceId, contactId]);
    const id = this.composite.get(this.compositeKey(sequenceId, contactId));
    if (!id) return null;
    return this.store.get(id) ?? null;
  }

  async findThreadId(sequenceId: string, contactId: string): Promise<string | null> {
    this.record("findThreadId", [sequenceId, contactId]);
    const id = this.composite.get(this.compositeKey(sequenceId, contactId));
    if (!id) return null;
    return this.store.get(id)?.threadId ?? null;
  }

  async updateBySequenceAndContact(
    sequenceId: string,
    contactId: string,
    data: UpdateStatusInput
  ): Promise<void> {
    this.record("updateBySequenceAndContact", [sequenceId, contactId, data]);
    const id = this.composite.get(this.compositeKey(sequenceId, contactId));
    if (!id) return;
    const row = this.store.get(id)!;
    Object.assign(row, data);
  }

  async upsertProgress(
    sequenceId: string,
    contactId: string,
    data: { currentStep: number; lastProcessedAt: Date; nextScheduledAt: Date | null }
  ): Promise<void> {
    this.record("upsertProgress", [sequenceId, contactId, data]);
    let id = this.composite.get(this.compositeKey(sequenceId, contactId));
    if (!id) {
      id = genId("sc");
      const row: SequenceContactRecord = {
        id,
        sequenceId,
        contactId,
        status: "pending",
        currentStep: data.currentStep,
        lastProcessedAt: data.lastProcessedAt,
        nextScheduledAt: data.nextScheduledAt,
        completed: false,
        completedAt: null,
        startedAt: null,
        threadId: null,
        failureCount: 0,
        lastError: null,
      };
      this.store.set(row);
      this.composite.set(this.compositeKey(sequenceId, contactId), id);
      return;
    }
    Object.assign(this.store.get(id)!, data);
  }

  async updateById(
    id: string,
    data: Partial<Pick<SequenceContactRecord, "failureCount" | "lastError" | "status" | "nextScheduledAt">>
  ): Promise<void> {
    this.record("updateById", [id, data]);
    const row = this.store.get(id);
    if (row) Object.assign(row, data);
  }

  async markTerminalBySequenceContact(
    sequenceId: string,
    contactId: string,
    data: { status: string; completed: boolean; completedAt: Date }
  ): Promise<{ count: number }> {
    this.record("markTerminalBySequenceContact", [sequenceId, contactId, data]);
    const id = this.composite.get(this.compositeKey(sequenceId, contactId));
    if (!id) return { count: 0 };
    Object.assign(this.store.get(id)!, data);
    return { count: 1 };
  }

  async addContactsToSequence(sequenceId: string, contactIds: string[]): Promise<void> {
    this.record("addContactsToSequence", [sequenceId, contactIds]);
    for (const contactId of contactIds) {
      const id = genId("sc");
      const row: SequenceContactRecord = {
        id,
        sequenceId,
        contactId,
        status: "pending",
        currentStep: 0,
        lastProcessedAt: null,
        nextScheduledAt: null,
        completed: false,
        completedAt: null,
        startedAt: null,
        threadId: null,
        failureCount: 0,
        lastError: null,
      };
      this.store.set(row);
      this.composite.set(this.compositeKey(sequenceId, contactId), id);
    }
  }

  async listContactIdsInSequence(sequenceId: string): Promise<string[]> {
    this.record("listContactIdsInSequence", [sequenceId]);
    return this.store.filter((r) => r.sequenceId === sequenceId).map((r) => r.contactId);
  }

  async listActiveWithContacts(
    sequenceId: string,
    excludeStatuses: string[]
  ): Promise<Array<{ id: string; contactId: string; status: string; contact: { id: string; email: string } }>> {
    this.record("listActiveWithContacts", [sequenceId, excludeStatuses]);
    return this.store
      .filter((r) => r.sequenceId === sequenceId && !excludeStatuses.includes(r.status))
      .map((r) => ({ id: r.id, contactId: r.contactId, status: r.status, contact: { id: r.contactId, email: "" } }));
  }

  /**
   * Poller: find due contacts. `now`-driven: returns contacts whose
   * nextScheduledAt is set and <= now, and that aren't in a terminal state.
   * Tests seed the full `DueContactGraph` shape via `seedDue()`.
   */
  async findDueContacts(now: Date): Promise<DueContactGraph[]> {
    this.record("findDueContacts", [now]);
    return this.dueRows.filter((r) => {
      const ns = r.nextScheduledAt;
      return ns != null && ns <= now && !r.completed;
    });
  }

  async findNewContacts(batchSize: number): Promise<NewContactGraph[]> {
    this.record("findNewContacts", [batchSize]);
    return [];
  }

  async peekNextScheduled(): Promise<{ id: string; scheduledTime: Date | null; step: number; email: string } | null> {
    this.record("peekNextScheduled", []);
    return null;
  }

  async countScheduledInWindow(start: Date, end: Date): Promise<number> {
    this.record("countScheduledInWindow", [start, end]);
    return this.dueRows.filter(
      (r) => r.nextScheduledAt && r.nextScheduledAt >= start && r.nextScheduledAt < end
    ).length;
  }

  async resetBySequence(sequenceId: string): Promise<void> {
    this.record("resetBySequence", [sequenceId]);
    for (const r of this.store.filter((x) => x.sequenceId === sequenceId)) {
      r.status = "pending";
      r.currentStep = 0;
      r.nextScheduledAt = null;
      r.completed = false;
      r.completedAt = null;
      r.startedAt = null;
      r.threadId = null;
      r.failureCount = 0;
      r.lastError = null;
    }
  }

  /** Test helper: the richer `DueContactGraph` rows the poller returns. */
  dueRows: DueContactGraph[] = [];

  override reset(): void {
    super.reset();
    this.store.clear();
    this.composite.clear();
    this.dueRows = [];
  }
}

// ---- SequenceStatsRepository ----------------------------------------------

export class FakeSequenceStatsRepository
  extends FakeBase
  implements SequenceStatsRepository
{
  store = new MemoryStore<SequenceStatsRecord>();

  async getBySequence(sequenceId: string): Promise<SequenceStatsRecord | null> {
    this.record("getBySequence", [sequenceId]);
    return this.store.get(sequenceId) ?? null;
  }

  async createForSequence(sequenceId: string, contactId?: string): Promise<SequenceStatsRecord> {
    this.record("createForSequence", [sequenceId, contactId]);
    const row: SequenceStatsRecord = this.zero(sequenceId, contactId);
    this.store.set(sequenceId, row);
    return row;
  }

  async updateCounts(sequenceId: string, counts: StatsCounts): Promise<void> {
    this.record("updateCounts", [sequenceId, counts]);
    let row = this.store.get(sequenceId);
    if (!row) {
      row = this.zero(sequenceId);
      this.store.set(sequenceId, row);
    }
    for (const [k, v] of Object.entries(counts)) {
      if (v == null) continue;
      (row as any)[k] = ((row as any)[k] ?? 0) + v;
    }
    this.recomputeRates(row);
  }

  async updateRaw(sequenceId: string, data: Record<string, unknown>): Promise<void> {
    this.record("updateRaw", [sequenceId, data]);
    let row = this.store.get(sequenceId);
    if (!row) {
      row = this.zero(sequenceId);
      this.store.set(sequenceId, row);
    }
    Object.assign(row, data);
    this.recomputeRates(row);
  }

  async createWithValues(data: {
    sequenceId: string;
    contactId?: string;
    totalEmails?: number;
    sentEmails?: number;
    openedEmails?: number;
    clickedEmails?: number;
    repliedEmails?: number;
    bouncedEmails?: number;
  }): Promise<SequenceStatsRecord> {
    this.record("createWithValues", [data]);
    const row: SequenceStatsRecord = { ...this.zero(data.sequenceId, data.contactId), ...data };
    this.store.set(data.sequenceId, row);
    return row;
  }

  async deleteBySequence(sequenceId: string): Promise<void> {
    this.record("deleteBySequence", [sequenceId]);
    this.store.rows.delete(sequenceId);
  }

  private zero(sequenceId: string, contactId?: string): SequenceStatsRecord {
    return {
      sequenceId,
      totalEmails: 0,
      sentEmails: 0,
      openedEmails: 0,
      uniqueOpens: 0,
      clickedEmails: 0,
      repliedEmails: 0,
      bouncedEmails: 0,
      failedEmails: 0,
      unsubscribed: 0,
      interested: 0,
      peopleContacted: 0,
      openRate: 0,
      clickRate: 0,
      replyRate: 0,
      bounceRate: 0,
      contactId: contactId ?? null,
    };
  }

  private recomputeRates(row: SequenceStatsRecord): void {
    const sent = row.sentEmails || 0;
    row.openRate = sent ? row.openedEmails / sent : 0;
    row.clickRate = sent ? row.clickedEmails / sent : 0;
    row.replyRate = sent ? row.repliedEmails / sent : 0;
    row.bounceRate = sent ? row.bouncedEmails / sent : 0;
  }

  override reset(): void {
    super.reset();
    this.store.clear();
  }
}

// ---- BusinessHoursRepository ----------------------------------------------

export class FakeBusinessHoursRepository
  extends FakeBase
  implements BusinessHoursRepository
{
  store = new MemoryStore<{ id: string; sequenceId: string; userId: string } & BusinessHours>();

  async findBySequence(userId: string, sequenceId: string): Promise<BusinessHours | null> {
    this.record("findBySequence", [userId, sequenceId]);
    return this.store.filter((b) => b.userId === userId && b.sequenceId === sequenceId)[0] ?? null;
  }

  async createForSequence(userId: string, sequenceId: string, defaults: BusinessHours): Promise<BusinessHours> {
    this.record("createForSequence", [userId, sequenceId, defaults]);
    const row = { id: genId("bh"), sequenceId, userId, ...defaults };
    this.store.set(row);
    return row;
  }

  override reset(): void {
    super.reset();
    this.store.clear();
  }
}
