import { Prisma } from "@prisma/client";
import {
  BusinessScheduleEnum,
  SequenceStatus,
  type BusinessHours,
  type ContactRecord,
  type DueContactGraph,
  type ListContactRow,
  type ListSyncRecord,
  type ListSyncRecordWithCount,
  type ListWithSequences,
  type NewContactGraph,
  type SequenceContactRecord,
  type SequenceMailboxRow,
  type SequenceRecord,
  type SequenceStatsRecord,
  type SequenceStepRecord,
  type SequenceWithDetails,
  type SequenceWithLaunchGraph,
  type StatsCounts,
  type StepWithSequenceMeta,
  type UpdateStatusInput,
} from "@coldjot/types";

/**
 * Sequence aggregate — model block for the composed domain extension.
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
export const sequenceModels = {
  sequence: {
      /**
       * Load a sequence by id + userId (ownership check).
       * Call sites: launch/pause/resume/reset validation.
       */
      async findByIdForUser(
        this: unknown,
        id: string,
        userId: string
      ): Promise<SequenceRecord | null> {
        const ctx = Prisma.getExtensionContext(this);
        const row = await ctx.findUnique({ where: { id, userId } });
        return row as unknown as SequenceRecord | null;
      },

      /**
       * Load a sequence with businessHours + active contacts + steps.
       * The launch path uses this to validate readiness + dispatch the job.
       * `excludeStatuses` filters out completed/opted_out contacts.
       */
      async findForLaunch(
        this: unknown,
        id: string,
        userId: string,
        excludeStatuses: string[]
      ): Promise<SequenceWithLaunchGraph | null> {
        const ctx = Prisma.getExtensionContext(this);
        const row = await ctx.findUnique({
          where: { id, userId },
          include: {
            businessHours: true,
            steps: { orderBy: { order: "asc" } },
            contacts: {
              where: { status: { notIn: excludeStatuses } },
              include: { contact: true },
            },
          },
        });
        return row as unknown as SequenceWithLaunchGraph | null;
      },

      /**
       * Load a sequence with sequenceMailbox + steps + businessHours.
       * Used by the sequence/email processors. Carries both the nested
       * `sequenceMailbox` relation and a flattened `sequenceMailboxId`.
       */
      async findWithDetails(
        this: unknown,
        id: string
      ): Promise<SequenceWithDetails | null> {
        const ctx = Prisma.getExtensionContext(this);
        const row = await ctx.findUnique({
          where: { id },
          include: {
            sequenceMailbox: true,
            steps: { orderBy: { order: "asc" } },
            businessHours: true,
          },
        });
        if (!row) return null;
        return {
          ...(row as any),
          sequenceMailboxId: (row as any).sequenceMailbox?.id,
        } as unknown as SequenceWithDetails;
      },

      /**
       * Load a sequence with its businessHours relation only.
       * Used by the email processor to resolve send windows.
       */
      async findWithBusinessHours(
        this: unknown,
        id: string
      ): Promise<{ businessHours: BusinessHours | null } | null> {
        const ctx = Prisma.getExtensionContext(this);
        return ctx.findUnique({
          where: { id },
          include: { businessHours: true },
        }) as Promise<{ businessHours: BusinessHours | null } | null>;
      },

      /**
       * Set a sequence's status (active / paused / draft).
       */
      async setStatus(this: unknown, id: string, status: string): Promise<void> {
        const ctx = Prisma.getExtensionContext(this);
        await ctx.update({ where: { id }, data: { status } });
      },

      /**
       * Reset a sequence back to draft + clear the testMode/disableSending flags.
       * The tracking/events/contacts/stats data is wiped separately (by
       * `resetSequence` in the jobs helper); this method only resets the
       * Sequence row itself.
       */
      async resetToDraft(this: unknown, id: string): Promise<void> {
        const ctx = Prisma.getExtensionContext(this);
        await ctx.update({
          where: { id },
          data: { status: "draft", testMode: false, disableSending: false },
        });
      },
    },

  businessHours: {
    /**
     * Fetch business hours for a sequence (by userId + sequenceId).
     */
    async findBySequence(
      this: unknown,
      userId: string,
      sequenceId: string
    ): Promise<BusinessHours | null> {
      const ctx = Prisma.getExtensionContext(this);
      const row = await ctx.findFirst({ where: { userId, sequenceId } });
      return row as unknown as BusinessHours | null;
    },

    /**
     * Create default business hours for a sequence.
     * `defaults` carries the timezone/workDays/workHours/type to seed.
     */
    async createForSequence(
      this: unknown,
      userId: string,
      sequenceId: string,
      defaults: BusinessHours
    ): Promise<BusinessHours> {
      const ctx = Prisma.getExtensionContext(this);
      const row = await ctx.create({
        data: {
          userId,
          sequenceId,
          timezone: defaults.timezone,
          workDays: defaults.workDays,
          workHoursStart: defaults.workHoursStart,
          workHoursEnd: defaults.workHoursEnd,
          type: defaults.type as any,
        },
      });
      return row as unknown as BusinessHours;
    },
  },

  sequenceStep: {
    /** Verify a step exists for a sequence at a given order. */
    async findBySequenceAndOrder(
      this: unknown,
      sequenceId: string,
      order: number
    ): Promise<SequenceStepRecord | null> {
      const ctx = Prisma.getExtensionContext(this);
      const row = await ctx.findFirst({ where: { sequenceId, order } });
      return row as unknown as SequenceStepRecord | null;
    },

    /** Load a step + minimal sequence metadata (validation). */
    async findWithSequenceMeta(
      this: unknown,
      stepId: string
    ): Promise<StepWithSequenceMeta | null> {
      const ctx = Prisma.getExtensionContext(this);
      const row = await ctx.findUnique({
        where: { id: stepId },
        include: {
          sequence: {
            select: { id: true, userId: true, status: true, name: true },
          },
        },
      });
      return row as unknown as StepWithSequenceMeta | null;
    },

    /** Count steps in a sequence (advancement logic). */
    async countInSequence(this: unknown, sequenceId: string): Promise<number> {
      const ctx = Prisma.getExtensionContext(this);
      return ctx.count({ where: { sequenceId } });
    },

    /** List steps in order (compute next step). */
    async listBySequence(
      this: unknown,
      sequenceId: string
    ): Promise<SequenceStepRecord[]> {
      const ctx = Prisma.getExtensionContext(this);
      const rows = await ctx.findMany({
        where: { sequenceId },
        orderBy: { order: "asc" },
      });
      return rows as unknown as SequenceStepRecord[];
    },
  },

  sequenceContact: {
    /** Composite-unique lookup. */
    async findBySequenceAndContact(
      this: unknown,
      sequenceId: string,
      contactId: string
    ): Promise<SequenceContactRecord | null> {
      const ctx = Prisma.getExtensionContext(this);
      const row = await ctx.findUnique({
        where: { sequenceId_contactId: { sequenceId, contactId } },
      });
      return row as unknown as SequenceContactRecord | null;
    },

    /** Fetch only the threadId for a contact (reply routing). */
    async findThreadId(
      this: unknown,
      sequenceId: string,
      contactId: string
    ): Promise<string | null> {
      const ctx = Prisma.getExtensionContext(this);
      const row = await ctx.findUnique({
        where: { sequenceId_contactId: { sequenceId, contactId } },
        select: { threadId: true },
      });
      return row?.threadId ?? null;
    },

    /** Update by composite unique. */
    async updateBySequenceAndContact(
      this: unknown,
      sequenceId: string,
      contactId: string,
      data: UpdateStatusInput
    ): Promise<void> {
      const ctx = Prisma.getExtensionContext(this);
      await ctx.update({
        where: { sequenceId_contactId: { sequenceId, contactId } },
        data: {
          status: data.status,
          completed: data.completed,
          completedAt:
            data.completed === true
              ? new Date()
              : data.completed === false
                ? null
                : undefined,
          updatedAt: new Date(),
          lastProcessedAt: data.lastProcessedAt,
          threadId: data.threadId,
          currentStep: data.currentStep,
          nextScheduledAt: data.nextScheduledAt,
        },
      });
    },

    /** Upsert progress by composite unique. */
    async upsertProgress(
      this: unknown,
      sequenceId: string,
      contactId: string,
      data: {
        currentStep: number;
        lastProcessedAt: Date;
        nextScheduledAt: Date | null;
      }
    ): Promise<void> {
      const ctx = Prisma.getExtensionContext(this);
      await ctx.upsert({
        where: { sequenceId_contactId: { sequenceId, contactId } },
        update: {
          currentStep: data.currentStep,
          lastProcessedAt: data.lastProcessedAt,
          nextScheduledAt: data.nextScheduledAt,
        },
        create: {
          sequenceId,
          contactId,
          currentStep: data.currentStep,
          lastProcessedAt: data.lastProcessedAt,
          nextScheduledAt: data.nextScheduledAt,
        },
      });
    },

    /** Update by id (schedule tick status/failure updates). */
    async updateById(
      this: unknown,
      id: string,
      data: Partial<
        Pick<
          SequenceContactRecord,
          "failureCount" | "lastError" | "status" | "nextScheduledAt"
        >
      >
    ): Promise<void> {
      const ctx = Prisma.getExtensionContext(this);
      await ctx.update({ where: { id }, data });
    },

    /** Mark a contact terminal by sequence+contact (reply/bounce handling). */
    async markTerminalBySequenceContact(
      this: unknown,
      sequenceId: string,
      contactId: string,
      data: { status: string; completed: boolean; completedAt: Date }
    ): Promise<{ count: number }> {
      const ctx = Prisma.getExtensionContext(this);
      return ctx.updateMany({
        where: {
          sequenceId,
          contactId,
          status: { notIn: ["completed", "bounced", "opted_out"] },
        },
        data: {
          status: data.status,
          completed: data.completed,
          completedAt: data.completedAt,
          updatedAt: new Date(),
          nextScheduledAt: null,
        },
      });
    },

    /** Bulk add contacts to a sequence (list sync). */
    async addContactsToSequence(
      this: unknown,
      sequenceId: string,
      contactIds: string[]
    ): Promise<void> {
      if (contactIds.length === 0) return;
      const ctx = Prisma.getExtensionContext(this);
      await ctx.createMany({
        data: contactIds.map((contactId) => ({
          sequenceId,
          contactId,
          status: "not_sent",
          currentStep: 0,
        })),
        skipDuplicates: true,
      });
    },

    /** List contact ids in a sequence (list sync). */
    async listContactIdsInSequence(
      this: unknown,
      sequenceId: string
    ): Promise<string[]> {
      const ctx = Prisma.getExtensionContext(this);
      const rows = await ctx.findMany({
        where: { sequenceId },
        select: { contactId: true },
      });
      return rows.map((r) => r.contactId);
    },

    /** List active contacts with their contact details (launch). */
    async listActiveWithContacts(
      this: unknown,
      sequenceId: string,
      excludeStatuses: string[]
    ): Promise<
      Array<{
        id: string;
        contactId: string;
        status: string;
        contact: { id: string; email: string };
      }>
    > {
      const ctx = Prisma.getExtensionContext(this);
      // sub-plan 06: exclude soft-deleted contacts — this query feeds
      // mailops sequence processing (an "act on" path), so trashed
      // contacts must never be picked up for enrollment/scheduling.
      const rows = await ctx.findMany({
        where: {
          sequenceId,
          status: { notIn: excludeStatuses },
          contact: { deletedAt: null },
        },
        include: { contact: true },
      });
      return rows as unknown as Array<{
        id: string;
        contactId: string;
        status: string;
        contact: { id: string; email: string };
      }>;
    },

    /** Find due contacts (schedule tick) — the big graph query. */
    async findDueContacts(this: unknown, now: Date): Promise<DueContactGraph[]> {
      const ctx = Prisma.getExtensionContext(this);
      // sub-plan 06: exclude soft-deleted contacts — this feeds the schedule
      // tick (an "act on" path) that enqueues email sends. Filtering here
      // avoids enqueueing a job for a trashed contact that the email
      // processor would just skip at send time anyway.
      const rows = await ctx.findMany({
        where: {
          AND: [
            { nextScheduledAt: { lte: now, not: null } },
            {
              AND: [
                { completed: false },
                { status: "in_progress" },
                { sequence: { status: SequenceStatus.ACTIVE } },
                { contact: { deletedAt: null } },
              ],
            },
          ],
        },
        select: {
          id: true,
          sequenceId: true,
          contactId: true,
          currentStep: true,
          lastProcessedAt: true,
          nextScheduledAt: true,
          completed: true,
          completedAt: true,
          createdAt: true,
          updatedAt: true,
          failureCount: true,
          sequence: {
            select: {
              id: true,
              userId: true,
              status: true,
              testMode: true,
              disableSending: true,
              sequenceMailbox: true,
              steps: {
                orderBy: { order: "asc" },
                select: {
                  id: true,
                  sequenceId: true,
                  stepType: true,
                  priority: true,
                  timing: true,
                  delayAmount: true,
                  delayUnit: true,
                  subject: true,
                  content: true,
                  includeSignature: true,
                  note: true,
                  order: true,
                  previousStepId: true,
                  replyToThread: true,
                  createdAt: true,
                  updatedAt: true,
                  templateId: true,
                },
              },
              businessHours: {
                select: {
                  timezone: true,
                  workDays: true,
                  workHoursStart: true,
                  workHoursEnd: true,
                },
              },
            },
          },
          contact: { select: { id: true, email: true } },
        },
      });
      return rows.map((r: any) => ({
        ...r,
        sequence: {
          ...r.sequence,
          sequenceMailboxId: r.sequence.sequenceMailbox?.id,
          businessHours: r.sequence.businessHours
            ? { ...r.sequence.businessHours, type: BusinessScheduleEnum.BUSINESS }
            : undefined,
        },
      })) as unknown as DueContactGraph[];
    },

    /** Find new contacts (contact processor) — batch of not_started. */
    async findNewContacts(
      this: unknown,
      batchSize: number
    ): Promise<NewContactGraph[]> {
      const ctx = Prisma.getExtensionContext(this);
      // sub-plan 06: exclude soft-deleted contacts — this feeds the mailops
      // contact processor (an "act on" path), so trashed contacts must never
      // be picked up for initial enrollment.
      const rows = await ctx.findMany({
        where: {
          status: "not_started",
          lastProcessedAt: null,
          contact: { deletedAt: null },
        },
        include: {
          sequence: {
            include: {
              sequenceMailbox: true,
              steps: { orderBy: { order: "asc" } },
              businessHours: true,
            },
          },
          contact: true,
        },
        take: batchSize,
      });
      return rows as unknown as NewContactGraph[];
    },

    /** Peek at the next scheduled contact (dev helpers). */
    async peekNextScheduled(
      this: unknown
    ): Promise<{
      id: string;
      scheduledTime: Date | null;
      step: number;
      email: string;
    } | null> {
      const ctx = Prisma.getExtensionContext(this);
      const row = await ctx.findFirst({
        where: { completed: false, nextScheduledAt: { not: null } },
        orderBy: { nextScheduledAt: "asc" },
        select: {
          id: true,
          nextScheduledAt: true,
          currentStep: true,
          contact: { select: { email: true } },
        },
      });
      if (!row) return null;
      return {
        id: row.id,
        scheduledTime: row.nextScheduledAt,
        step: row.currentStep,
        email: row.contact.email,
      };
    },

    /** Count contacts scheduled in a window (rate-limit slot check). */
    async countScheduledInWindow(
      this: unknown,
      start: Date,
      end: Date
    ): Promise<number> {
      const ctx = Prisma.getExtensionContext(this);
      return ctx.count({
        where: { nextScheduledAt: { gte: start, lt: end } },
      });
    },

    /** Reset all contacts for a sequence (sequence reset). */
    async resetBySequence(
      this: unknown,
      sequenceId: string
    ): Promise<void> {
      const ctx = Prisma.getExtensionContext(this);
      await ctx.updateMany({
        where: { sequenceId },
        data: {
          status: "pending",
          lastProcessedAt: null,
          completedAt: null,
          threadId: null,
          currentStep: 0,
          nextScheduledAt: null,
          completed: false,
          startedAt: null,
        },
      });
    },
  },

  // ── sequenceMailbox (join table) ────────────────────────────────────────
  // Hosts the `findSequenceMailbox*` methods from the old mailbox repo —
  // they query this model, so they must live in its block (not `mailbox`).

  sequenceMailbox: {
    /** Just the mailboxId bound to a sequence (thread-watch lookup). */
    async findSequenceMailboxId(
      this: unknown,
      sequenceId: string
    ): Promise<string | null> {
      const ctx = Prisma.getExtensionContext(this);
      const row = await ctx.findUnique({
        where: { sequenceId },
      });
      return row?.mailboxId ?? null;
    },

    /** SequenceMailbox by its own id, with mailbox + alias joined. */
    async findSequenceMailboxById(
      this: unknown,
      id: string
    ): Promise<SequenceMailboxRow | null> {
      const ctx = Prisma.getExtensionContext(this);
      const row = await ctx.findUnique({
        where: { id },
        include: { alias: true, mailbox: true },
      });
      return row as unknown as SequenceMailboxRow | null;
    },

    /** SequenceMailbox by sequenceMailboxId + sequenceId + userId (with joins). */
    async findSequenceMailbox(
      this: unknown,
      sequenceMailboxId: string,
      sequenceId: string,
      userId: string
    ): Promise<SequenceMailboxRow | null> {
      const ctx = Prisma.getExtensionContext(this);
      const row = await ctx.findUnique({
        where: {
          sequenceId,
          mailboxId: sequenceMailboxId,
          userId,
        },
        include: { alias: true, mailbox: true },
      });
      return row as unknown as SequenceMailboxRow | null;
    },
  },

  // ── emailList (list sync) ───────────────────────────────────────────────

  emailList: {
    /** Contact count for a list (used by the list-sync processor to sort). */
    async contactCount(this: unknown, listId: string): Promise<number> {
      const ctx = Prisma.getExtensionContext(this);
      // jobs/list/processor.ts reads this via listSyncRecord.include.list._count.
      // The repository exposes it directly so the call site can migrate.
      const row = await ctx.findUnique({
        where: { id: listId },
        select: { _count: { select: { contacts: true } } },
      });
      return row?._count?.contacts ?? 0;
    },

    /** Load a list with the sequences attached to it (sync routing). */
    async findWithSequences(
      this: unknown,
      listId: string
    ): Promise<ListWithSequences | null> {
      const ctx = Prisma.getExtensionContext(this);
      // jobs/list/helper.ts:17 — list + attached sequence ids.
      const row = await ctx.findUnique({
        where: { id: listId },
        include: {
          sequences: { select: { id: true } },
        },
      });
      return row as unknown as ListWithSequences | null;
    },

    /** Fetch a page of contacts on a list (sync batches contacts in chunks). */
    async findContactsPage(
      this: unknown,
      listId: string,
      take: number,
      skip: number
    ): Promise<ListContactRow[]> {
      const ctx = Prisma.getExtensionContext(this);
      // jobs/list/helper.ts:67 — paginated contact fetch for batch sync.
      const row = await ctx.findUnique({
        where: { id: listId },
        include: {
          contacts: { take, skip },
        },
      });
      return (row?.contacts ?? []) as unknown as ListContactRow[];
    },
  },

  // ── listSyncRecord (list→sequence sync jobs) ────────────────────────────

  listSyncRecord: {
    /** Enqueue a new list→sequence sync job. (Named `record` to avoid shadowing Prisma's built-in `create`.) */
    async record(
      this: unknown,
      input: {
        listId: string;
        sequenceId: string;
      }
    ): Promise<ListSyncRecord> {
      const ctx = Prisma.getExtensionContext(this);
      // routes/lists/index.ts:22
      const row = await ctx.create({
        data: {
          listId: input.listId,
          sequenceId: input.sequenceId,
          status: "pending",
          contactsAdded: 0,
        },
      });
      return row as unknown as ListSyncRecord;
    },

    /** Poll pending sync records ordered oldest-first, with list contact counts. */
    async findPending(
      this: unknown,
      batchSize: number
    ): Promise<ListSyncRecordWithCount[]> {
      const ctx = Prisma.getExtensionContext(this);
      // jobs/list/processor.ts:75
      const rows = await ctx.findMany({
        where: { status: "pending" },
        orderBy: { createdAt: "asc" },
        take: batchSize,
        include: {
          list: { select: { _count: { select: { contacts: true } } } },
        },
      });
      return rows as unknown as ListSyncRecordWithCount[];
    },

    /** Mark a record processing/completed/failed. */
    async updateStatus(
      this: unknown,
      id: string,
      data: { status: string; contactsAdded?: number; error?: string | null }
    ): Promise<void> {
      const ctx = Prisma.getExtensionContext(this);
      // jobs/list/processor.ts:102,109,117
      await ctx.update({ where: { id }, data });
    },

    /** Bulk update by listId+sequenceId (reconciliation helper). */
    async updateStatusByListSequence(
      this: unknown,
      listId: string,
      sequenceId: string,
      data: { status: string; contactsAdded?: number; error?: string | null }
    ): Promise<void> {
      const ctx = Prisma.getExtensionContext(this);
      // jobs/list/helper.ts:143
      await ctx.updateMany({
        where: {
          listId,
          sequenceId,
          status: { in: ["pending", "processing"] },
        },
        data: { ...data, updatedAt: new Date() },
      });
    },
  },

  // ── sequenceStats ───────────────────────────────────────────────────────
  // NOTE: today's codebase calls `findUnique({ where: { sequenceId } })` on a
  // non-PK field. The interface normalizes this to findFirst; the rate-math
  // consolidation lands in Phase 4.

  sequenceStats: {
    /** Fetch stats for a sequence (findFirst by sequenceId). */
    async getBySequence(
      this: unknown,
      sequenceId: string
    ): Promise<SequenceStatsRecord | null> {
      const ctx = Prisma.getExtensionContext(this);
      // lib/tracking/index.ts:537 + lib/stats/index.ts:63
      const row = await ctx.findFirst({ where: { sequenceId } });
      return row as unknown as SequenceStatsRecord | null;
    },

    /** Initialize a zeroed stats row. */
    async createForSequence(
      this: unknown,
      sequenceId: string,
      contactId?: string
    ): Promise<SequenceStatsRecord> {
      const ctx = Prisma.getExtensionContext(this);
      // lib/tracking/index.ts:434 + lib/stats/index.ts:68 + monitor/service.ts:69
      const row = await ctx.create({
        data: {
          sequenceId,
          contactId,
          totalEmails: 0,
          sentEmails: 0,
          openedEmails: 0,
          clickedEmails: 0,
          repliedEmails: 0,
          bouncedEmails: 0,
          openRate: 0,
          clickRate: 0,
          replyRate: 0,
          bounceRate: 0,
        } as any,
      });
      return row as unknown as SequenceStatsRecord;
    },

    /** Increment counters + recompute rates. */
    async updateCounts(
      this: unknown,
      sequenceId: string,
      counts: StatsCounts
    ): Promise<void> {
      const ctx = Prisma.getExtensionContext(this);
      // lib/tracking/index.ts:497,601 — increment + recompute rates inline.
      // Phase 4 collapses the divergent rate-math paths into one helper.
      const data: Record<string, number> = {};
      if (counts.totalEmails) data.totalEmails = { increment: counts.totalEmails } as any;
      if (counts.sentEmails) data.sentEmails = { increment: counts.sentEmails } as any;
      if (counts.openedEmails) data.openedEmails = { increment: counts.openedEmails } as any;
      if (counts.clickedEmails) data.clickedEmails = { increment: counts.clickedEmails } as any;
      if (counts.repliedEmails) data.repliedEmails = { increment: counts.repliedEmails } as any;
      if (counts.bouncedEmails) data.bouncedEmails = { increment: counts.bouncedEmails } as any;
      await ctx.update({ where: { sequenceId }, data });
    },

    /** Raw update — accepts a Prisma-shaped data object (legacy rate-math path). */
    async updateRaw(
      this: unknown,
      sequenceId: string,
      data: Record<string, unknown>
    ): Promise<void> {
      const ctx = Prisma.getExtensionContext(this);
      // Legacy inline rate-math path — Phase 4 removes this.
      await ctx.update({ where: { sequenceId }, data: data as any });
    },

    /** Create with explicit field values (legacy trackEmailEvent init path). */
    async createWithValues(
      this: unknown,
      input: {
        sequenceId: string;
        contactId?: string;
        totalEmails?: number;
        sentEmails?: number;
        openedEmails?: number;
        clickedEmails?: number;
        repliedEmails?: number;
        bouncedEmails?: number;
      }
    ): Promise<SequenceStatsRecord> {
      const ctx = Prisma.getExtensionContext(this);
      const row = await ctx.create({
        data: {
          sequenceId: input.sequenceId,
          contactId: input.contactId,
          totalEmails: input.totalEmails ?? 0,
          sentEmails: input.sentEmails ?? 0,
          openedEmails: input.openedEmails ?? 0,
          clickedEmails: input.clickedEmails ?? 0,
          repliedEmails: input.repliedEmails ?? 0,
          bouncedEmails: input.bouncedEmails ?? 0,
        } as any,
      });
      return row as unknown as SequenceStatsRecord;
    },

    /** Bulk delete by sequenceId (sequence reset). */
    async deleteBySequence(
      this: unknown,
      sequenceId: string
    ): Promise<void> {
      const ctx = Prisma.getExtensionContext(this);
      // jobs/sequence/helper.ts:221
      await ctx.deleteMany({ where: { sequenceId } });
    },
  },

  // ── contact ────────────────────────────────────────────────────────────

  contact: {
    /** Reads a contact by id, INCLUDING soft-deleted rows. Use for
     *  admin/diagnostic/purge paths (or anything that legitimately needs
     *  to read trashed data). */
    async findById(
      this: unknown,
      id: string
    ): Promise<ContactRecord | null> {
      const ctx = Prisma.getExtensionContext(this);
      // jobs/email/processor.ts:115 (note: call sites that should NOT act on
      // deleted contacts must switch to findActiveById — see sub-plan 06)
      const row = await ctx.findUnique({ where: { id } });
      return row as unknown as ContactRecord | null;
    },

    /** Reads a contact by id ONLY if it is NOT soft-deleted
     *  (deletedAt IS NULL). Use for every "should I act on this contact?"
     *  path — sending email, enrolling in sequences, etc. Returns null for
     *  trashed contacts. findFirst (not findUnique) because deletedAt is not
     *  unique; id is a @id so at most one row matches. */
    async findActiveById(
      this: unknown,
      id: string
    ): Promise<ContactRecord | null> {
      const ctx = Prisma.getExtensionContext(this);
      const row = await ctx.findFirst({
        where: { id, deletedAt: null },
      });
      return row as unknown as ContactRecord | null;
    },
  },
};
