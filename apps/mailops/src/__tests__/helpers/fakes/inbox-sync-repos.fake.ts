/**
 * In-memory fakes for the remaining repositories the unit/integration tests
 * consume (email-thread, processed-message, email-watch + history, mailbox,
 * contact, template, list, list-sync-record). Grouped for brevity — each is
 * small and they're seeded together in the inbox-sync / list-sync tests.
 */
import type {
  EmailThreadRepository,
  EmailThreadRecord,
  EmailThreadWithSequence,
} from "@/repositories/email-thread.repo";
import type {
  ProcessedMessageRepository,
  ProcessedMessageRecord,
} from "@/repositories/processed-message.repo";
import type {
  EmailWatchRepository,
  EmailWatchRecord,
} from "@/repositories/email-watch.repo";
import type {
  EmailWatchHistoryRepository,
  EmailWatchHistoryRecord,
} from "@/repositories/email-watch-history.repo";
import type {
  MailboxRepository,
  MailboxRecord,
  MailboxWithAliasesRecord,
  SequenceMailboxRow,
} from "@/repositories/mailbox.repo";
import type {
  ContactRepository,
  ContactRecord,
} from "@/repositories/contact.repo";
import type {
  TemplateRepository,
  TemplateRecord,
} from "@/repositories/template.repo";
import type {
  ListRepository,
  ListWithSequences,
  ListContactRow,
} from "@/repositories/list.repo";
import type {
  ListSyncRecordRepository,
  ListSyncRecord,
} from "@/repositories/list-sync-record.repo";

import { FakeBase, MemoryStore, genId } from "./base";

// ---- EmailThreadRepository ------------------------------------------------

export class FakeEmailThreadRepository
  extends FakeBase
  implements EmailThreadRepository
{
  store = new MemoryStore<EmailThreadRecord>();

  /** Insert a thread row keyed by threadId (the EmailThread PK). */
  seedThread(row: EmailThreadRecord): void {
    this.store.set(row.threadId, row);
    this.store.index("threadId", row.threadId, row.threadId);
  }

  async findByThread(threadId: string, withSequence?: boolean): Promise<EmailThreadRecord | null> {
    this.record("findByThread", [threadId, withSequence]);
    const row = this.store.findByIndexed("threadId", threadId);
    if (!row) return null;
    if (withSequence) return { ...row, sequence: { userId: row.userId } } as EmailThreadWithSequence;
    return row;
  }

  async findSubjectByThread(threadId: string): Promise<string | null> {
    this.record("findSubjectByThread", [threadId]);
    return this.store.findByIndexed("threadId", threadId)?.subject ?? null;
  }

  async findSequenceContactByThread(threadId: string): Promise<{ sequenceId: string; contactId: string } | null> {
    this.record("findSequenceContactByThread", [threadId]);
    const row = this.store.findByIndexed("threadId", threadId);
    return row ? { sequenceId: row.sequenceId, contactId: row.contactId } : null;
  }

  async create(input: {
    threadId: string;
    sequenceId: string;
    contactId: string;
    userId: string;
    firstMessageId: string;
    subject: string;
    isFake?: boolean;
  }): Promise<EmailThreadRecord> {
    this.record("create", [input]);
    const row: EmailThreadRecord = {
      threadId: input.threadId,
      sequenceId: input.sequenceId,
      contactId: input.contactId,
      userId: input.userId,
      firstMessageId: input.firstMessageId,
      subject: input.subject,
      isFake: input.isFake ?? false,
      lastCheckedAt: null,
      metadata: null,
    };
    this.seedThread(row);
    return row;
  }

  async findManyForChecking(where: Record<string, unknown>, take: number): Promise<EmailThreadWithSequence[]> {
    this.record("findManyForChecking", [where, take]);
    // `where` filtering left to the test seeding; return all with a sequence attached.
    return this.store.filter(() => true).slice(0, take).map((r) => ({ ...r, sequence: { userId: r.userId } })) as EmailThreadWithSequence[];
  }

  async updateCheckMetadata(threadId: string, lastCheckedAt: Date, metadata: Record<string, unknown>): Promise<void> {
    this.record("updateCheckMetadata", [threadId, lastCheckedAt, metadata]);
    const row = this.store.findByIndexed("threadId", threadId);
    if (row) {
      row.lastCheckedAt = lastCheckedAt;
      row.metadata = metadata;
    }
  }

  async markCompleted(threadId: string, existingMetadata: Record<string, unknown> | null, reason: string, at: Date): Promise<void> {
    this.record("markCompleted", [threadId, existingMetadata, reason, at]);
    const row = this.store.findByIndexed("threadId", threadId);
    if (row) row.metadata = { ...(existingMetadata ?? {}), COMPLETED: { reason, at } };
  }

  override reset(): void {
    super.reset();
    this.store.clear();
  }
}

// ---- ProcessedMessageRepository -------------------------------------------

export class FakeProcessedMessageRepository
  extends FakeBase
  implements ProcessedMessageRepository
{
  store = new MemoryStore<ProcessedMessageRecord>();

  async findByMessageId(messageId: string): Promise<ProcessedMessageRecord | null> {
    this.record("findByMessageId", [messageId]);
    return this.store.findByIndexed("messageId", messageId) ?? null;
  }

  async create(input: { messageId: string; threadId: string; type: string }): Promise<ProcessedMessageRecord> {
    this.record("create", [input]);
    const row: ProcessedMessageRecord = { id: genId("pm"), ...input };
    this.store.set(row);
    this.store.index("messageId", row.messageId, row.id);
    return row;
  }

  async hasOriginalForThread(threadId: string): Promise<boolean> {
    this.record("hasOriginalForThread", [threadId]);
    return this.store.filter((r) => r.threadId === threadId && r.type === "ORIGINAL").length > 0;
  }

  override reset(): void {
    super.reset();
    this.store.clear();
  }
}

// ---- EmailWatchRepository -------------------------------------------------

export class FakeEmailWatchRepository
  extends FakeBase
  implements EmailWatchRepository
{
  store = new MemoryStore<EmailWatchRecord>();

  async findById(id: string): Promise<EmailWatchRecord | null> {
    this.record("findById", [id]);
    return this.store.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<EmailWatchRecord | null> {
    this.record("findByEmail", [email]);
    return this.store.findByIndexed("email", email) ?? null;
  }

  async findDueForRenewal(buffer: Date): Promise<EmailWatchRecord[]> {
    this.record("findDueForRenewal", [buffer]);
    return this.store.filter((w) => w.expiration <= buffer);
  }

  async listAll(): Promise<EmailWatchRecord[]> {
    this.record("listAll", []);
    return [...this.store.rows.values()];
  }

  async create(input: { id: string; userId: string; email: string; historyId: string; expiration: Date }): Promise<EmailWatchRecord> {
    this.record("create", [input]);
    const now = new Date();
    const row: EmailWatchRecord = { ...input, createdAt: now, updatedAt: now };
    this.store.set(row);
    this.store.index("email", row.email, row.id);
    return row;
  }

  async updateById(id: string, data: { historyId?: string; expiration?: Date }): Promise<void> {
    this.record("updateById", [id, data]);
    const row = this.store.get(id);
    if (row) Object.assign(row, data, { updatedAt: new Date() });
  }

  async updateByEmail(email: string, data: { historyId?: string; expiration?: Date }): Promise<void> {
    this.record("updateByEmail", [email, data]);
    const row = this.store.findByIndexed("email", email);
    if (row) Object.assign(row, data, { updatedAt: new Date() });
  }

  async deleteByEmail(email: string): Promise<void> {
    this.record("deleteByEmail", [email]);
    const row = this.store.findByIndexed("email", email);
    if (row) this.store.rows.delete(row.id);
  }

  override reset(): void {
    super.reset();
    this.store.clear();
  }
}

// ---- EmailWatchHistoryRepository ------------------------------------------

export class FakeEmailWatchHistoryRepository
  extends FakeBase
  implements EmailWatchHistoryRepository
{
  store = new MemoryStore<EmailWatchHistoryRecord>();

  async findProcessed(emailWatchId: string, historyId: string): Promise<EmailWatchHistoryRecord | null> {
    this.record("findProcessed", [emailWatchId, historyId]);
    return (
      this.store.filter(
        (r) => r.emailWatchId === emailWatchId && r.historyId === historyId && r.processed
      )[0] ?? null
    );
  }

  async upsert(input: {
    id: string;
    emailWatchId: string;
    historyId: string;
    notificationType: string;
    processed: boolean;
    data: Record<string, unknown>;
  }): Promise<void> {
    this.record("upsert", [input]);
    this.store.set(input);
  }

  async create(input: {
    id: string;
    emailWatchId: string;
    historyId: string;
    notificationType: string;
    processed: boolean;
    data: Record<string, unknown>;
  }): Promise<void> {
    this.record("create", [input]);
    this.store.set(input);
  }

  async markProcessed(id: string): Promise<void> {
    this.record("markProcessed", [id]);
    const row = this.store.get(id);
    if (row) row.processed = true;
  }

  async purgeProcessedBefore(cutoff: Date): Promise<{ count: number }> {
    this.record("purgeProcessedBefore", [cutoff]);
    // No createdAt on the interface; no-op in the fake.
    return { count: 0 };
  }

  override reset(): void {
    super.reset();
    this.store.clear();
  }
}

// ---- MailboxRepository ----------------------------------------------------

export class FakeMailboxRepository
  extends FakeBase
  implements MailboxRepository
{
  store = new MemoryStore<MailboxRecord & { aliases?: any[] }>();
  sequenceMailboxes = new MemoryStore<SequenceMailboxRow>();

  async findWithAliases(id: string, userId: string): Promise<MailboxWithAliasesRecord | null> {
    this.record("findWithAliases", [id, userId]);
    const row = this.store.get(id);
    if (!row || row.userId !== userId) return null;
    return { ...row, aliases: row.aliases ?? [] };
  }

  async findByIdForUser(id: string, userId: string): Promise<MailboxRecord | null> {
    this.record("findByIdForUser", [id, userId]);
    const row = this.store.get(id);
    if (!row || row.userId !== userId) return null;
    return row;
  }

  async findActiveGmail(userId: string, email: string): Promise<MailboxRecord | null> {
    this.record("findActiveGmail", [userId, email]);
    return this.store.filter((m) => m.userId === userId && m.email === email && m.isActive)[0] ?? null;
  }

  async findActiveGmailByEmail(email: string): Promise<MailboxRecord | null> {
    this.record("findActiveGmailByEmail", [email]);
    return this.store.filter((m) => m.email === email && m.isActive)[0] ?? null;
  }

  async findWithEmailAliases(email: string): Promise<MailboxWithAliasesRecord | null> {
    this.record("findWithEmailAliases", [email]);
    const row = this.store.findByIndexed("email", email);
    if (!row) return null;
    return { ...row, aliases: row.aliases ?? [] };
  }

  async updateTokens(id: string, accessToken: string, expiresAtMs: number): Promise<void> {
    this.record("updateTokens", [id, accessToken, expiresAtMs]);
    const row = this.store.get(id);
    if (row) {
      row.access_token = accessToken;
      row.expires_at = Math.floor(expiresAtMs / 1000);
    }
  }

  async findSequenceMailboxId(sequenceId: string): Promise<string | null> {
    this.record("findSequenceMailboxId", [sequenceId]);
    return this.sequenceMailboxes.filter((s) => s.sequenceId === sequenceId)[0]?.id ?? null;
  }

  async findSequenceMailboxById(id: string): Promise<SequenceMailboxRow | null> {
    this.record("findSequenceMailboxById", [id]);
    return this.sequenceMailboxes.get(id) ?? null;
  }

  async findSequenceMailbox(
    sequenceMailboxId: string,
    sequenceId: string,
    userId: string
  ): Promise<SequenceMailboxRow | null> {
    this.record("findSequenceMailbox", [sequenceMailboxId, sequenceId, userId]);
    return this.sequenceMailboxes.get(sequenceMailboxId) ?? null;
  }

  override reset(): void {
    super.reset();
    this.store.clear();
    this.sequenceMailboxes.clear();
  }
}

// ---- ContactRepository ----------------------------------------------------

export class FakeContactRepository extends FakeBase implements ContactRepository {
  store = new MemoryStore<ContactRecord>();

  async findById(id: string): Promise<ContactRecord | null> {
    this.record("findById", [id]);
    return this.store.get(id) ?? null;
  }

  override reset(): void {
    super.reset();
    this.store.clear();
  }
}

// ---- TemplateRepository ---------------------------------------------------

export class FakeTemplateRepository extends FakeBase implements TemplateRepository {
  store = new MemoryStore<TemplateRecord>();

  async findSubject(id: string): Promise<string | null> {
    this.record("findSubject", [id]);
    return this.store.get(id)?.subject ?? null;
  }

  async findById(id: string): Promise<TemplateRecord | null> {
    this.record("findById", [id]);
    return this.store.get(id) ?? null;
  }

  override reset(): void {
    super.reset();
    this.store.clear();
  }
}

// ---- ListRepository -------------------------------------------------------

export class FakeListRepository extends FakeBase implements ListRepository {
  private lists = new Map<string, ListWithSequences>();
  private contacts = new Map<string, ListContactRow[]>();

  seedList(listId: string, sequences: ListSequenceRefShape[] = [], contacts: ListContactRow[] = []): void {
    this.lists.set(listId, { id: listId, sequences });
    this.contacts.set(listId, contacts);
  }

  async contactCount(listId: string): Promise<number> {
    this.record("contactCount", [listId]);
    return this.contacts.get(listId)?.length ?? 0;
  }

  async findWithSequences(listId: string): Promise<ListWithSequences | null> {
    this.record("findWithSequences", [listId]);
    return this.lists.get(listId) ?? null;
  }

  async findContactsPage(listId: string, take: number, skip: number): Promise<ListContactRow[]> {
    this.record("findContactsPage", [listId, take, skip]);
    const all = this.contacts.get(listId) ?? [];
    return all.slice(skip, skip + take);
  }

  override reset(): void {
    super.reset();
    this.lists.clear();
    this.contacts.clear();
  }
}

type ListSequenceRefShape = { id: string };

// ---- ListSyncRecordRepository ---------------------------------------------

export class FakeListSyncRecordRepository
  extends FakeBase
  implements ListSyncRecordRepository
{
  store = new MemoryStore<ListSyncRecord>();

  async create(input: { listId: string; sequenceId: string }): Promise<ListSyncRecord> {
    this.record("create", [input]);
    const row: ListSyncRecord = {
      id: genId("sync"),
      listId: input.listId,
      sequenceId: input.sequenceId,
      status: "pending",
      contactsAdded: 0,
      error: null,
      createdAt: new Date(),
    };
    this.store.set(row);
    return row;
  }

  async findPending(batchSize: number): Promise<any[]> {
    this.record("findPending", [batchSize]);
    const pending = this.store.filter((r) => r.status === "pending");
    pending.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return pending.slice(0, batchSize).map((r) => ({
      ...r,
      list: { _count: { contacts: 0 } },
    }));
  }

  async updateStatus(
    id: string,
    data: { status: string; contactsAdded?: number; error?: string | null }
  ): Promise<void> {
    this.record("updateStatus", [id, data]);
    const row = this.store.get(id);
    if (row) Object.assign(row, data);
  }

  async updateStatusByListSequence(
    listId: string,
    sequenceId: string,
    data: { status: string; contactsAdded?: number; error?: string | null }
  ): Promise<void> {
    this.record("updateStatusByListSequence", [listId, sequenceId, data]);
    for (const row of this.store.filter((r) => r.listId === listId && r.sequenceId === sequenceId)) {
      Object.assign(row, data);
    }
  }

  override reset(): void {
    super.reset();
    this.store.clear();
  }
}
