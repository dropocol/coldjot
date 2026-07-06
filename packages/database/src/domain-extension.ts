/**
 * Domain Prisma extension — reusable, named data-access methods attached
 * directly to Prisma models via `$extends({ model: { ... } })`.
 *
 * This replaces the former hand-written repository layer in `apps/mailops`.
 * Instead of one interface file + one Prisma-impl file per concept, each
 * domain query is a single method defined here. Call sites read:
 *
 *   await db.sequence.resetToDraft(id)
 *   await db.sequence.findForLaunch(id, userId)
 *   await db.businessHours.createForSequence(userId, seqId, defaults)
 *
 * The methods are composed onto the same extended client that carries the
 * token-encryption extension, so consumers get one `db` object with both
 * raw Prisma access and these domain helpers.
 *
 * Adding a new method: drop it under the relevant `model` block. Use
 * `Prisma.getExtensionContext(this)` to get the typed Prisma delegate for
 * the current model (see existing methods). The return type is inferred —
 * cast to a domain record type from `@coldjot/types` when the row needs
 * narrowing (same `as unknown as T` pattern the old repos used).
 */
import { Prisma } from "@prisma/client";
import {
  BusinessScheduleEnum,
  EmailEventEnum,
  EmailTrackingStatusEnum,
  SequenceStatus,
  type BusinessHours,
  type CreateEventInput,
  type CreatePendingInput,
  type DueContactGraph,
  type EmailEventRecord,
  type EmailThreadRecord,
  type EmailThreadWithSequence,
  type EmailTrackingRecord,
  type EmailTrackingWithLink,
  type EmailTrackingWithOpenEvents,
  type EmailWatchHistoryRecord,
  type EmailWatchRecord,
  type MailboxRecord,
  type MailboxWithAliasesRecord,
  type NewContactGraph,
  type ProcessedMessageRecord,
  type SequenceContactRecord,
  type SequenceMailboxRow,
  type SequenceRecord,
  type SequenceStepRecord,
  type SequenceWithDetails,
  type SequenceWithLaunchGraph,
  type SentDetails,
  type StepWithSequenceMeta,
  type TrackedLinkRecord,
  type TrackedLinkWithTracking,
  type UpdateStatusInput,
} from "@coldjot/types";

export const domainExtension = Prisma.defineExtension({
  name: "domain",
  model: {
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

    // ── emailTracking ──────────────────────────────────────────────────────

    emailTracking: {
      /** Create a tracking row at status=pending (default) or override. */
      async createPending(
        this: unknown,
        input: CreatePendingInput
      ): Promise<EmailTrackingRecord> {
        const ctx = Prisma.getExtensionContext(this);
        const row = await ctx.create({
          data: {
            ...(input.id ? { id: input.id } : {}),
            hash: input.hash,
            userId: input.userId,
            sequenceId: input.sequenceId,
            stepId: input.stepId,
            contactId: input.contactId,
            subject: input.subject,
            jobId: input.jobId,
            status: input.status ?? "pending",
            messageId: input.messageId,
            threadId: input.threadId,
            sentAt: input.sentAt,
            openCount: 0,
            createdAt: new Date(),
            metadata: input.metadata as any,
            ...(input.messageId
              ? {
                  events: {
                    create: {
                      type: EmailEventEnum.SENT,
                      sequenceId: input.sequenceId,
                      contactId: input.contactId,
                      metadata: { messageId: input.messageId },
                    },
                  },
                }
              : {}),
          },
        });
        return row as unknown as EmailTrackingRecord;
      },

      /** Look up by tracking hash. */
      async findByHash(
        this: unknown,
        hash: string
      ): Promise<EmailTrackingRecord | null> {
        const ctx = Prisma.getExtensionContext(this);
        const row = await ctx.findUnique({ where: { hash } });
        return row as unknown as EmailTrackingRecord | null;
      },

      /** Idempotency guard: find a SENT tracking for a jobId. */
      async findSentByJobId(
        this: unknown,
        jobId: string
      ): Promise<{ id: string } | null> {
        const ctx = Prisma.getExtensionContext(this);
        return ctx.findFirst({
          where: { jobId, status: EmailTrackingStatusEnum.SENT },
          select: { id: true },
        });
      },

      /** Fetch tracking + its OPENED events (first-open detection). */
      async findWithOpenEvents(
        this: unknown,
        hash: string
      ): Promise<EmailTrackingWithOpenEvents | null> {
        const ctx = Prisma.getExtensionContext(this);
        const row = await ctx.findUnique({
          where: { hash },
          include: { events: { where: { type: EmailEventEnum.OPENED } } },
        });
        return row as unknown as EmailTrackingWithOpenEvents | null;
      },

      /** Fetch tracking filtered to one link id (click handling). */
      async findWithLink(
        this: unknown,
        hash: string,
        linkId: string
      ): Promise<EmailTrackingWithLink | null> {
        const ctx = Prisma.getExtensionContext(this);
        const row = await ctx.findUnique({
          where: { hash },
          include: { links: { where: { id: linkId } } },
        });
        return row as unknown as EmailTrackingWithLink | null;
      },

      /** Look up by primary id. */
      async findById(
        this: unknown,
        id: string
      ): Promise<EmailTrackingRecord | null> {
        const ctx = Prisma.getExtensionContext(this);
        const row = await ctx.findUnique({ where: { id } });
        return row as unknown as EmailTrackingRecord | null;
      },

      /** Count tracking rows in a thread (new-thread vs. reply decision). */
      async countByThread(this: unknown, threadId: string): Promise<number> {
        const ctx = Prisma.getExtensionContext(this);
        return ctx.count({ where: { threadId } });
      },

      /** Earliest non-empty subject on a thread (reply-subject fallback). */
      async findEarliestSubjectInThread(
        this: unknown,
        threadId: string
      ): Promise<string | null> {
        const ctx = Prisma.getExtensionContext(this);
        const row = await ctx.findFirst({
          where: { threadId, subject: { not: "" } },
          orderBy: { createdAt: "asc" },
          select: { subject: true },
        });
        return row?.subject ?? null;
      },

      /** Mark a tracking row SENT + write the nested SENT event atomically. */
      async markSent(
        this: unknown,
        trackingId: string,
        details: SentDetails,
        subject: string,
        sequenceId: string,
        contactId: string,
        metadata: Record<string, unknown>
      ): Promise<void> {
        const ctx = Prisma.getExtensionContext(this);
        await ctx.update({
          where: { id: trackingId },
          data: {
            messageId: details.messageId,
            threadId: details.threadId,
            status: EmailTrackingStatusEnum.SENT,
            subject,
            events: {
              create: {
                type: EmailEventEnum.SENT,
                sequenceId,
                contactId,
                metadata: metadata as any,
              },
            },
          },
        });
      },

      /** Increment open count, set OPENED status, write nested OPENED event. */
      async recordOpen(
        this: unknown,
        hash: string,
        sequenceId: string,
        contactId: string,
        metadata: Record<string, unknown>
      ): Promise<void> {
        const ctx = Prisma.getExtensionContext(this);
        await ctx.update({
          where: { hash },
          data: {
            openCount: { increment: 1 },
            openedAt: new Date(),
            status: EmailTrackingStatusEnum.OPENED,
            events: {
              create: {
                type: EmailEventEnum.OPENED,
                sequenceId,
                contactId,
                metadata: metadata as any,
              },
            },
          },
        });
      },

      /** Standalone recordEmailOpen path: increment openCount + set "opened" status only. */
      async incrementOpenStatus(
        this: unknown,
        hash: string,
        setOpenedAt: boolean
      ): Promise<void> {
        const ctx = Prisma.getExtensionContext(this);
        await ctx.update({
          where: { hash },
          data: {
            status: "opened",
            openCount: { increment: 1 },
            openedAt: setOpenedAt ? new Date() : undefined,
          },
        });
      },

      /** Set CLICKED status, set clickedAt, write nested CLICKED event. */
      async recordClick(
        this: unknown,
        trackingId: string,
        sequenceId: string,
        contactId: string,
        timestamp: Date,
        metadata: Record<string, unknown>
      ): Promise<void> {
        const ctx = Prisma.getExtensionContext(this);
        await ctx.update({
          where: { id: trackingId },
          data: {
            clickedAt: timestamp,
            status: EmailTrackingStatusEnum.CLICKED,
            events: {
              create: {
                type: EmailEventEnum.CLICKED,
                sequenceId,
                contactId,
                timestamp,
                metadata: metadata as any,
              },
            },
          },
        });
      },

      /** Set the tracking status from an event type (trackEmailEvent path). */
      async setStatus(
        this: unknown,
        id: string,
        status: EmailEventEnum | string
      ): Promise<void> {
        const ctx = Prisma.getExtensionContext(this);
        await ctx.update({ where: { id }, data: { status: status as string } });
      },

      /** Bulk delete by sequenceId (sequence reset). */
      async deleteBySequence(
        this: unknown,
        sequenceId: string
      ): Promise<void> {
        const ctx = Prisma.getExtensionContext(this);
        await ctx.deleteMany({
          where: { metadata: { path: ["sequenceId"], equals: sequenceId } },
        });
      },
    },

    // ── emailEvent ─────────────────────────────────────────────────────────

    emailEvent: {
      /** Create an event row. (Named `record` to avoid shadowing Prisma's built-in `create`.) */
      async record(
        this: unknown,
        input: CreateEventInput
      ): Promise<EmailEventRecord> {
        const ctx = Prisma.getExtensionContext(this);
        const row = await ctx.create({
          data: {
            trackingId: input.trackingId,
            type: input.type,
            sequenceId: input.sequenceId,
            contactId: input.contactId,
            metadata: (input.metadata ?? {}) as any,
            ...(input.timestamp ? { timestamp: input.timestamp } : {}),
          },
        });
        return row as unknown as EmailEventRecord;
      },

      /** Find the first event matching trackingId + type (uniqueness checks). */
      async findFirstByTrackingAndType(
        this: unknown,
        trackingId: string,
        type: EmailEventEnum
      ): Promise<EmailEventRecord | null> {
        const ctx = Prisma.getExtensionContext(this);
        const row = await ctx.findFirst({ where: { trackingId, type } });
        return row as unknown as EmailEventRecord | null;
      },

      /** Find first event matching trackingId + type + sequenceId. */
      async findFirstByTrackingTypeSequence(
        this: unknown,
        trackingId: string,
        type: EmailEventEnum,
        sequenceId: string
      ): Promise<EmailEventRecord | null> {
        const ctx = Prisma.getExtensionContext(this);
        const row = await ctx.findFirst({
          where: { trackingId, type, sequenceId },
        });
        return row as unknown as EmailEventRecord | null;
      },

      /** Find first event of a type for a sequence+contact (bounce/reply dedupe). */
      async findFirstBySequenceContactType(
        this: unknown,
        sequenceId: string,
        contactId: string,
        type: EmailEventEnum
      ): Promise<EmailEventRecord | null> {
        const ctx = Prisma.getExtensionContext(this);
        const row = await ctx.findFirst({
          where: { sequenceId, contactId, type },
        });
        return row as unknown as EmailEventRecord | null;
      },

      /** Count events of a type for a sequence+contact (uniqueness). */
      async countBySequenceContactType(
        this: unknown,
        sequenceId: string,
        contactId: string,
        type: EmailEventEnum
      ): Promise<number> {
        const ctx = Prisma.getExtensionContext(this);
        return ctx.count({ where: { sequenceId, contactId, type } });
      },

      /** Pre-send bounce/reply check across multiple types. */
      async existsBySequenceContactInTypes(
        this: unknown,
        sequenceId: string,
        contactId: string,
        types: EmailEventEnum[]
      ): Promise<boolean> {
        const ctx = Prisma.getExtensionContext(this);
        const rows = await ctx.findMany({
          where: { sequenceId, contactId, type: { in: types as string[] } },
        });
        return rows.length > 0;
      },

      /** Fetch all events for a tracking row. */
      async listByTracking(
        this: unknown,
        trackingId: string
      ): Promise<EmailEventRecord[]> {
        const ctx = Prisma.getExtensionContext(this);
        const rows = await ctx.findMany({
          where: { trackingId },
          orderBy: { timestamp: "desc" },
        });
        return rows as unknown as EmailEventRecord[];
      },

      /** Bulk delete by sequenceId (sequence reset). */
      async deleteBySequence(
        this: unknown,
        sequenceId: string
      ): Promise<void> {
        const ctx = Prisma.getExtensionContext(this);
        await ctx.deleteMany({ where: { sequenceId } });
      },
    },

    // ── trackedLink ────────────────────────────────────────────────────────

    trackedLink: {
      /** Create a tracked link for an outgoing email. (Named `createLink` to avoid shadowing Prisma's built-in `create`.) */
      async createLink(
        this: unknown,
        input: { emailTrackingId: string; originalUrl: string }
      ): Promise<TrackedLinkRecord> {
        const ctx = Prisma.getExtensionContext(this);
        const row = await ctx.create({
          data: {
            emailTrackingId: input.emailTrackingId,
            originalUrl: input.originalUrl,
            clickCount: 0,
          },
        });
        return row as unknown as TrackedLinkRecord;
      },

      /** Find a link + its parent tracking (click handling). */
      async findWithTracking(
        this: unknown,
        linkId: string
      ): Promise<TrackedLinkWithTracking | null> {
        const ctx = Prisma.getExtensionContext(this);
        const row = await ctx.findUnique({
          where: { id: linkId },
          include: { emailTracking: true },
        });
        return row as unknown as TrackedLinkWithTracking | null;
      },

      /** Increment click count (called inside a transaction by callers). */
      async incrementClickCount(
        this: unknown,
        linkId: string,
        at: Date
      ): Promise<void> {
        const ctx = Prisma.getExtensionContext(this);
        await ctx.update({
          where: { id: linkId },
          data: { clickCount: { increment: 1 }, updatedAt: at },
        });
      },
    },

    // ── sequenceStep ───────────────────────────────────────────────────────

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

    // ── sequenceContact ────────────────────────────────────────────────────

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
        const rows = await ctx.findMany({
          where: { sequenceId, status: { notIn: excludeStatuses } },
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
        const rows = await ctx.findMany({
          where: {
            AND: [
              { nextScheduledAt: { lte: now, not: null } },
              {
                AND: [
                  { completed: false },
                  { status: "in_progress" },
                  { sequence: { status: SequenceStatus.ACTIVE } },
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
        const rows = await ctx.findMany({
          where: { status: "not_started", lastProcessedAt: null },
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

    // ── mailbox ────────────────────────────────────────────────────────────
    // Note: the three `findSequenceMailbox*` methods from the old repo query
    // the *SequenceMailbox* model, not Mailbox. They live in the separate
    // `sequenceMailbox` block below so `ctx` resolves to the right delegate.

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

    // ── emailWatch ─────────────────────────────────────────────────────────

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
  },
});
