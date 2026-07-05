import { prisma } from "@coldjot/database";
import { SequenceStatus, BusinessScheduleEnum } from "@coldjot/types";
import type {
  SequenceContactRepository,
  SequenceContactRecord,
  DueContactGraph,
  NewContactGraph,
  UpdateStatusInput,
} from "../sequence-contact.repo";

export class PrismaSequenceContactRepository
  implements SequenceContactRepository
{
  async findBySequenceAndContact(
    sequenceId: string,
    contactId: string
  ): Promise<SequenceContactRecord | null> {
    // pubsub/helper.ts:297,1333
    const row = await prisma.sequenceContact.findUnique({
      where: { sequenceId_contactId: { sequenceId, contactId } },
    });
    return row as unknown as SequenceContactRecord | null;
  }

  async findThreadId(
    sequenceId: string,
    contactId: string
  ): Promise<string | null> {
    // schedule/processor.ts:449
    const row = await prisma.sequenceContact.findUnique({
      where: { sequenceId_contactId: { sequenceId, contactId } },
      select: { threadId: true },
    });
    return row?.threadId ?? null;
  }

  async updateBySequenceAndContact(
    sequenceId: string,
    contactId: string,
    data: UpdateStatusInput
  ): Promise<void> {
    // jobs/sequence/helper.ts:48,79
    await prisma.sequenceContact.update({
      where: { sequenceId_contactId: { sequenceId, contactId } },
      data: {
        status: data.status,
        completed: data.completed,
        completedAt: data.completed === true ? new Date() : data.completed === false ? null : undefined,
        updatedAt: new Date(),
        lastProcessedAt: data.lastProcessedAt,
        threadId: data.threadId,
        currentStep: data.currentStep,
        nextScheduledAt: data.nextScheduledAt,
      },
    });
  }

  async upsertProgress(
    sequenceId: string,
    contactId: string,
    data: {
      currentStep: number;
      lastProcessedAt: Date;
      nextScheduledAt: Date | null;
    }
  ): Promise<void> {
    // jobs/sequence/helper.ts:102
    await prisma.sequenceContact.upsert({
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
  }

  async updateById(
    id: string,
    data: Partial<
      Pick<
        SequenceContactRecord,
        "failureCount" | "lastError" | "status" | "nextScheduledAt"
      >
    >
  ): Promise<void> {
    // schedule/processor.ts:613,640
    await prisma.sequenceContact.update({ where: { id }, data });
  }

  async markTerminalBySequenceContact(
    sequenceId: string,
    contactId: string,
    data: { status: string; completed: boolean; completedAt: Date }
  ): Promise<void> {
    // pubsub/handler.ts:971,1136
    await prisma.sequenceContact.updateMany({
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
  }

  async addContactsToSequence(
    sequenceId: string,
    contactIds: string[]
  ): Promise<void> {
    // jobs/list/helper.ts:199
    if (contactIds.length === 0) return;
    await prisma.sequenceContact.createMany({
      data: contactIds.map((contactId) => ({
        sequenceId,
        contactId,
        status: "not_sent",
        currentStep: 0,
      })),
      skipDuplicates: true,
    });
  }

  async listContactIdsInSequence(sequenceId: string): Promise<string[]> {
    // jobs/list/helper.ts:176
    const rows = await prisma.sequenceContact.findMany({
      where: { sequenceId },
      select: { contactId: true },
    });
    return rows.map((r) => r.contactId);
  }

  async listActiveWithContacts(
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
    // jobs/sequence/helper.ts:132 + sequence/controller launch include
    const rows = await prisma.sequenceContact.findMany({
      where: { sequenceId, status: { notIn: excludeStatuses } },
      include: { contact: true },
    });
    return rows as unknown as Array<{
      id: string;
      contactId: string;
      status: string;
      contact: { id: string; email: string };
    }>;
  }

  async findDueContacts(now: Date): Promise<DueContactGraph[]> {
    // schedule/processor.ts:133
    const rows = await prisma.sequenceContact.findMany({
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
    // Map to the domain shape (flatten sequenceMailbox + businessHours type).
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
  }

  async findNewContacts(batchSize: number): Promise<NewContactGraph[]> {
    // contact/processor.ts:79
    const rows = await prisma.sequenceContact.findMany({
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
  }

  async peekNextScheduled(): Promise<{
    id: string;
    scheduledTime: Date | null;
    step: number;
    email: string;
  } | null> {
    // schedule/processor.ts:673
    const row = await prisma.sequenceContact.findFirst({
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
  }

  async countScheduledInWindow(start: Date, end: Date): Promise<number> {
    // schedule/index.ts:447,456 — minute/hour slot check
    return prisma.sequenceContact.count({
      where: { nextScheduledAt: { gte: start, lt: end } },
    });
  }

  async resetBySequence(sequenceId: string): Promise<void> {
    // jobs/sequence/helper.ts:203
    await prisma.sequenceContact.updateMany({
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
  }
}
