import { Prisma } from "@prisma/client";
import {
  EmailEventEnum,
  EmailTrackingStatusEnum,
  type CreateEventInput,
  type CreatePendingInput,
  type EmailEventRecord,
  type EmailTrackingRecord,
  type EmailTrackingWithLink,
  type EmailTrackingWithOpenEvents,
  type SentDetails,
  type TemplateRecord,
  type TrackedLinkRecord,
  type TrackedLinkWithTracking,
} from "@coldjot/types";

/**
 * Email/tracking aggregate — model block for the composed domain extension.
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
export const emailModels = {
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

  template: {
    /** Fetch just the subject (email-subject resolution). */
    async findSubject(
      this: unknown,
      id: string
    ): Promise<string | null> {
      const ctx = Prisma.getExtensionContext(this);
      // lib/email-subject.ts:71,196,238,258,291
      const row = await ctx.findUnique({
        where: { id },
        select: { subject: true },
      });
      return row?.subject ?? null;
    },

    /** Fetch subject + content (email send). */
    async findById(
      this: unknown,
      id: string
    ): Promise<TemplateRecord | null> {
      const ctx = Prisma.getExtensionContext(this);
      // jobs/email/processor.ts:99
      const row = await ctx.findUnique({ where: { id } });
      return row as unknown as TemplateRecord | null;
    },
  },
};
