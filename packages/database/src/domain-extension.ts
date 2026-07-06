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
import type {
  BusinessHours,
  SequenceRecord,
  SequenceWithDetails,
  SequenceWithLaunchGraph,
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
  },
});
