import { Prisma } from "@prisma/client";
import {
  type EmailThreadRecord,
  type EmailThreadWithSequence,
  type EmailWatchHistoryRecord,
  type EmailWatchRecord,
  type MailboxRecord,
  type MailboxWithAliasesRecord,
  type ProcessedMessageRecord,
} from "@coldjot/types";

/**
 * Inbox/watch aggregate — model block for the composed domain extension.
 *
 * Exposed as a plain `{ [model]: {...} }` object (not a `defineExtension`) so
 * `domain-extension.ts` can merge every aggregate's models into a SINGLE
 * `Prisma.defineExtension`. Prisma only emits model-extension methods into the
 * generated `.d.ts` when they all live in one extension — chaining several
 * model-bearing extensions via `$extends()` collapses the emitted `model` type
 * to `{}` and breaks downstream typechecks. See domain-extension.ts.
 *
 * Model block contents are copied verbatim from the original monolithic
 * domain-extension.ts — no logic/query/cast changes.
 */
export const inboxModels = {
  // ── mailbox ────────────────────────────────────────────────────────────
  // Note: the three `findSequenceMailbox*` methods from the old repo query
  // the *SequenceMailbox* model, not Mailbox. They live in the separate
  // `sequenceMailbox` block in sequence.ts so `ctx` resolves to the right delegate.

  mailbox: {
      /** Load mailbox by id+userId, with aliases. */
      async findWithAliases(
        this: unknown,
        id: string,
        userId: string
      ): Promise<MailboxWithAliasesRecord | null> {
        const ctx = Prisma.getExtensionContext(this);
        const row = await ctx.findUnique({
          where: { id, userId },
          include: { aliases: true },
        });
        return row as unknown as MailboxWithAliasesRecord | null;
      },

      /** Load mailbox by id+userId (no aliases) — Gmail client construction. */
      async findByIdForUser(
        this: unknown,
        id: string,
        userId: string
      ): Promise<MailboxRecord | null> {
        const ctx = Prisma.getExtensionContext(this);
        const row = await ctx.findUnique({ where: { id, userId } });
        return row as unknown as MailboxRecord | null;
      },

      /** Verify an active Gmail mailbox exists for a user+email. */
      async findActiveGmail(
        this: unknown,
        userId: string,
        email: string
      ): Promise<MailboxRecord | null> {
        const ctx = Prisma.getExtensionContext(this);
        const row = await ctx.findFirst({
          where: { userId, email, isActive: true, provider: "gmail" },
        });
        return row as unknown as MailboxRecord | null;
      },

      /** Active Gmail mailbox by email alone (watch service — no userId on hand). */
      async findActiveGmailByEmail(
        this: unknown,
        email: string
      ): Promise<MailboxRecord | null> {
        const ctx = Prisma.getExtensionContext(this);
        const row = await ctx.findFirst({
          where: { email, isActive: true, provider: "gmail" },
        });
        return row as unknown as MailboxRecord | null;
      },

      /** Find any mailbox (active or not) by email, with aliases (pubsub routing). */
      async findWithEmailAliases(
        this: unknown,
        email: string
      ): Promise<MailboxWithAliasesRecord | null> {
        const ctx = Prisma.getExtensionContext(this);
        const row = await ctx.findFirst({
          where: { email },
          include: { aliases: true },
        });
        return row as unknown as MailboxWithAliasesRecord | null;
      },

      /** Persist refreshed access token + expiry (epoch ms → seconds). */
      async updateTokens(
        this: unknown,
        id: string,
        accessToken: string,
        expiresAtMs: number
      ): Promise<void> {
        const ctx = Prisma.getExtensionContext(this);
        await ctx.update({
          where: { id },
          data: {
            access_token: accessToken,
            expires_at: expiresAtMs ? expiresAtMs / 1000 : null,
          },
        });
      },
    },

  emailWatch: {
    /** Find a watch by its id. */
    async findById(
      this: unknown,
      id: string
    ): Promise<EmailWatchRecord | null> {
      const ctx = Prisma.getExtensionContext(this);
      const row = await ctx.findUnique({ where: { id } });
      return row as unknown as EmailWatchRecord | null;
    },

    /** Find a watch by its mailbox email. */
    async findByEmail(
      this: unknown,
      email: string
    ): Promise<EmailWatchRecord | null> {
      const ctx = Prisma.getExtensionContext(this);
      const row = await ctx.findUnique({ where: { email } });
      return row as unknown as EmailWatchRecord | null;
    },

    /** Find all watches whose expiration is at/before the buffer time. */
    async findDueForRenewal(
      this: unknown,
      buffer: Date
    ): Promise<EmailWatchRecord[]> {
      const ctx = Prisma.getExtensionContext(this);
      const rows = await ctx.findMany({
        where: { expiration: { lte: buffer } },
      });
      return rows as unknown as EmailWatchRecord[];
    },

    /** Dev helper: list every watch. */
    async listAll(this: unknown): Promise<EmailWatchRecord[]> {
      const ctx = Prisma.getExtensionContext(this);
      const rows = await ctx.findMany();
      return rows as unknown as EmailWatchRecord[];
    },

    /** Create a new watch row. (Named `record` to avoid shadowing Prisma's built-in `create`.) */
    async record(
      this: unknown,
      input: {
        id: string;
        userId: string;
        email: string;
        historyId: string;
        expiration: Date;
      }
    ): Promise<EmailWatchRecord> {
      const ctx = Prisma.getExtensionContext(this);
      const row = await ctx.create({ data: input });
      return row as unknown as EmailWatchRecord;
    },

    /** Update historyId + expiration by id (renewal). */
    async updateById(
      this: unknown,
      id: string,
      data: { historyId?: string; expiration?: Date }
    ): Promise<void> {
      const ctx = Prisma.getExtensionContext(this);
      await ctx.update({
        where: { id },
        data: { ...data, updatedAt: new Date() },
      });
    },

    /** Update historyId + expiration by email (setup-on-existing). */
    async updateByEmail(
      this: unknown,
      email: string,
      data: { historyId?: string; expiration?: Date }
    ): Promise<void> {
      const ctx = Prisma.getExtensionContext(this);
      await ctx.update({
        where: { email },
        data: { ...data, updatedAt: new Date() },
      });
    },

    /** Delete a watch by email (stop). */
    async deleteByEmail(this: unknown, email: string): Promise<void> {
      const ctx = Prisma.getExtensionContext(this);
      await ctx.delete({ where: { email } });
    },
  },

  // ── emailWatchHistory ──────────────────────────────────────────────────
  // NOTE: the repo's `create` and `upsert` are renamed to `record` and
  // `upsertRecord` — both shadow Prisma's built-ins of the same name and
  // would recurse at runtime. See emailEvent.record / trackedLink.createLink
  // for the established convention.

  emailWatchHistory: {
    /** Idempotency check: has this historyId already been processed? */
    async findProcessed(
      this: unknown,
      emailWatchId: string,
      historyId: string
    ): Promise<EmailWatchHistoryRecord | null> {
      const ctx = Prisma.getExtensionContext(this);
      const row = await ctx.findFirst({
        where: { emailWatchId, historyId, processed: true },
      });
      return row as unknown as EmailWatchHistoryRecord | null;
    },

    /** Upsert a history record (create-or-update). (Named `upsertRecord` to avoid shadowing Prisma's built-in `upsert`.) */
    async upsertRecord(
      this: unknown,
      input: {
        id: string;
        emailWatchId: string;
        historyId: string;
        notificationType: string;
        processed: boolean;
        data: Record<string, unknown>;
      }
    ): Promise<void> {
      const ctx = Prisma.getExtensionContext(this);
      await ctx.upsert({
        where: { id: input.id },
        create: {
          id: input.id,
          emailWatchId: input.emailWatchId,
          historyId: input.historyId,
          notificationType: input.notificationType,
          processed: input.processed,
          data: input.data as any,
        },
        update: {
          notificationType: input.notificationType,
          processed: input.processed,
          data: input.data as any,
        },
      });
    },

    /** Create a new history record (initial notification intake). (Named `record` to avoid shadowing Prisma's built-in `create`.) */
    async record(
      this: unknown,
      input: {
        id: string;
        emailWatchId: string;
        historyId: string;
        notificationType: string;
        processed: boolean;
        data: Record<string, unknown>;
      }
    ): Promise<void> {
      const ctx = Prisma.getExtensionContext(this);
      await ctx.create({
        data: {
          id: input.id,
          emailWatchId: input.emailWatchId,
          historyId: input.historyId,
          notificationType: input.notificationType,
          processed: input.processed,
          data: input.data as any,
        },
      });
    },

    /** Mark a notification as processed. */
    async markProcessed(this: unknown, id: string): Promise<void> {
      const ctx = Prisma.getExtensionContext(this);
      await ctx.update({
        where: { id },
        data: { processed: true },
      });
    },

    /** Purge history older than the cutoff that's already processed. */
    async purgeProcessedBefore(
      this: unknown,
      cutoff: Date
    ): Promise<{ count: number }> {
      const ctx = Prisma.getExtensionContext(this);
      return ctx.deleteMany({
        where: { createdAt: { lt: cutoff }, processed: true },
      });
    },
  },

  // ── processedMessage ───────────────────────────────────────────────────
  // NOTE: the repo's `create` is renamed to `record` — it shadows Prisma's
  // built-in `create`.

  processedMessage: {
    /** Idempotency check: has this messageId already been processed? */
    async findByMessageId(
      this: unknown,
      messageId: string
    ): Promise<ProcessedMessageRecord | null> {
      const ctx = Prisma.getExtensionContext(this);
      const row = await ctx.findUnique({ where: { messageId } });
      return row as unknown as ProcessedMessageRecord | null;
    },

    /** Record a processed message (P2002 tolerant in callers). (Named `record` to avoid shadowing Prisma's built-in `create`.) */
    async record(
      this: unknown,
      input: {
        messageId: string;
        threadId: string;
        type: string;
      }
    ): Promise<ProcessedMessageRecord> {
      const ctx = Prisma.getExtensionContext(this);
      const row = await ctx.create({ data: input });
      return row as unknown as ProcessedMessageRecord;
    },

    /** Is there any prior processed message for a thread? */
    async hasOriginalForThread(
      this: unknown,
      threadId: string
    ): Promise<boolean> {
      const ctx = Prisma.getExtensionContext(this);
      const rows = await ctx.findMany({
        where: { threadId },
        orderBy: { createdAt: "asc" },
        take: 1,
      });
      return rows.length > 0;
    },
  },

  // ── emailThread ────────────────────────────────────────────────────────
  // NOTE: the repo's `create` is renamed to `record` — it shadows Prisma's
  // built-in `create`.

  emailThread: {
    /** Look up a thread, optionally with the parent sequence. */
    async findByThread(
      this: unknown,
      threadId: string,
      withSequence = false
    ): Promise<EmailThreadRecord | null> {
      const ctx = Prisma.getExtensionContext(this);
      const row = await ctx.findUnique({
        where: { threadId },
        ...(withSequence ? { include: { sequence: true } } : {}),
      });
      return row as unknown as EmailThreadRecord | null;
    },

    /** Fetch just the subject (email-subject resolution). */
    async findSubjectByThread(
      this: unknown,
      threadId: string
    ): Promise<string | null> {
      const ctx = Prisma.getExtensionContext(this);
      const row = await ctx.findUnique({
        where: { threadId },
        select: { subject: true },
      });
      return row?.subject ?? null;
    },

    /** Fetch sequenceId + contactId for a thread (pubsub routing). */
    async findSequenceContactByThread(
      this: unknown,
      threadId: string
    ): Promise<{ sequenceId: string; contactId: string } | null> {
      const ctx = Prisma.getExtensionContext(this);
      const row = await ctx.findUnique({
        where: { threadId },
        select: { sequenceId: true, contactId: true },
      });
      return row as { sequenceId: string; contactId: string } | null;
    },

    /** Create a thread row on first send. (Named `record` to avoid shadowing Prisma's built-in `create`.) */
    async record(
      this: unknown,
      input: {
        threadId: string;
        sequenceId: string;
        contactId: string;
        userId: string;
        firstMessageId: string;
        subject: string;
        isFake?: boolean;
      }
    ): Promise<EmailThreadRecord> {
      const ctx = Prisma.getExtensionContext(this);
      const row = await ctx.create({
        data: {
          threadId: input.threadId,
          sequenceId: input.sequenceId,
          contactId: input.contactId,
          userId: input.userId,
          firstMessageId: input.firstMessageId,
          subject: input.subject,
          isFake: input.isFake ?? false,
        },
      });
      return row as unknown as EmailThreadRecord;
    },

    /**
     * Find threads that need checking (thread-watch processor). The where clause
     * is built by the caller (age + lastCheckedAt tiers); passed through as-is.
     * Ordered by updatedAt desc, lastCheckedAt asc, createdAt asc.
     */
    async findManyForChecking(
      this: unknown,
      where: Record<string, unknown>,
      take: number
    ): Promise<EmailThreadWithSequence[]> {
      const ctx = Prisma.getExtensionContext(this);
      const rows = await ctx.findMany({
        where: where as any,
        take,
        orderBy: [
          { updatedAt: "desc" },
          { lastCheckedAt: "asc" },
          { createdAt: "asc" },
        ],
        include: {
          sequence: {
            select: { userId: true },
          },
        },
      });
      return rows as unknown as EmailThreadWithSequence[];
    },

    /**
     * Update lastCheckedAt + metadata after a thread-watch check pass.
     * Both fields are written together (the metadata reflects the check).
     */
    async updateCheckMetadata(
      this: unknown,
      threadId: string,
      lastCheckedAt: Date,
      metadata: Record<string, unknown>
    ): Promise<void> {
      const ctx = Prisma.getExtensionContext(this);
      await ctx.update({
        where: { threadId },
        data: {
          lastCheckedAt,
          metadata: metadata as any,
        },
      });
    },

    /**
     * Mark a thread COMPLETED with merged metadata (thread-watch when no
     * mailbox is found, etc.). Existing metadata is spread into the new blob.
     */
    async markCompleted(
      this: unknown,
      threadId: string,
      existingMetadata: Record<string, unknown> | null,
      reason: string,
      at: Date
    ): Promise<void> {
      const ctx = Prisma.getExtensionContext(this);
      await ctx.update({
        where: { threadId },
        data: {
          metadata: {
            ...(existingMetadata ?? {}),
            status: "COMPLETED",
            reason,
            completedAt: at.toISOString(),
          } as any,
        },
      });
    },
  },
};
