import { prisma } from "@coldjot/database";
import { EmailTrackingStatusEnum, EmailEventEnum } from "@coldjot/types";
import type {
  EmailTrackingRepository,
  EmailTrackingRecord,
  CreatePendingInput,
  SentDetails,
  EmailTrackingWithOpenEvents,
  EmailTrackingWithLink,
} from "../email-tracking.repo";

/**
 * Prisma implementation of EmailTrackingRepository.
 *
 * Each method copies the exact Prisma call from its original call site
 * (lib/tracking/index.ts, lib/email/index.ts, services/jobs/email/processor.ts,
 * lib/email-subject.ts). Phase 0 characterization tests pin any current bugs.
 */
export class PrismaEmailTrackingRepository implements EmailTrackingRepository {
  async createPending(input: CreatePendingInput): Promise<EmailTrackingRecord> {
    // lib/email/index.ts:301 + lib/tracking/index.ts:66
    const row = await prisma.emailTracking.create({
      data: {
        id: input.id,
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
  }

  async findByHash(hash: string): Promise<EmailTrackingRecord | null> {
    // lib/tracking/index.ts:93
    const row = await prisma.emailTracking.findUnique({ where: { hash } });
    return row as unknown as EmailTrackingRecord | null;
  }

  async findSentByJobId(jobId: string): Promise<{ id: string } | null> {
    // services/jobs/email/processor.ts:71
    return prisma.emailTracking.findFirst({
      where: { jobId, status: EmailTrackingStatusEnum.SENT },
      select: { id: true },
    });
  }

  async findWithOpenEvents(
    hash: string
  ): Promise<EmailTrackingWithOpenEvents | null> {
    // lib/tracking/index.ts:610
    const row = await prisma.emailTracking.findUnique({
      where: { hash },
      include: { events: { where: { type: EmailEventEnum.OPENED } } },
    });
    return row as unknown as EmailTrackingWithOpenEvents | null;
  }

  async findWithLink(
    hash: string,
    linkId: string
  ): Promise<EmailTrackingWithLink | null> {
    // lib/tracking/index.ts:672
    const row = await prisma.emailTracking.findUnique({
      where: { hash },
      include: { links: { where: { id: linkId } } },
    });
    return row as unknown as EmailTrackingWithLink | null;
  }

  async findById(id: string): Promise<EmailTrackingRecord | null> {
    // lib/tracking/index.ts:762
    const row = await prisma.emailTracking.findUnique({ where: { id } });
    return row as unknown as EmailTrackingRecord | null;
  }

  async countByThread(threadId: string): Promise<number> {
    // lib/email-subject.ts:48
    return prisma.emailTracking.count({ where: { threadId } });
  }

  async findEarliestSubjectInThread(threadId: string): Promise<string | null> {
    // lib/email-subject.ts:140
    const row = await prisma.emailTracking.findFirst({
      where: { threadId, subject: { not: "" } },
      orderBy: { createdAt: "asc" },
      select: { subject: true },
    });
    return row?.subject ?? null;
  }

  async markSent(
    trackingId: string,
    details: SentDetails,
    subject: string,
    sequenceId: string,
    contactId: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    // lib/email/index.ts:259
    await prisma.emailTracking.update({
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
  }

  async recordOpen(
    hash: string,
    sequenceId: string,
    contactId: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    // lib/tracking/index.ts:629
    await prisma.emailTracking.update({
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
  }

  async recordClick(
    trackingId: string,
    sequenceId: string,
    contactId: string,
    timestamp: Date,
    metadata: Record<string, unknown>
  ): Promise<void> {
    // lib/tracking/index.ts:716
    await prisma.emailTracking.update({
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
  }

  async setStatus(id: string, status: EmailEventEnum | string): Promise<void> {
    // lib/tracking/index.ts:781
    await prisma.emailTracking.update({ where: { id }, data: { status: status as string } });
  }

  async deleteBySequence(sequenceId: string): Promise<void> {
    // services/jobs/sequence/helper.ts:184 — filters on JSON metadata path.
    await prisma.emailTracking.deleteMany({
      where: { metadata: { path: ["sequenceId"], equals: sequenceId } },
    });
  }
}
