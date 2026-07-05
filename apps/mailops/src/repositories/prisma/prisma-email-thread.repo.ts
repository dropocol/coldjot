import { prisma } from "@coldjot/database";
import type {
  EmailThreadRecord,
  EmailThreadRepository,
  EmailThreadWithSequence,
} from "../email-thread.repo";

export class PrismaEmailThreadRepository implements EmailThreadRepository {
  async findByThread(
    threadId: string,
    withSequence = false
  ): Promise<EmailThreadRecord | null> {
    // pubsub/handler.ts (bounce/reply/contact resolution) + thread-watch
    const row = await prisma.emailThread.findUnique({
      where: { threadId },
      ...(withSequence ? { include: { sequence: true } } : {}),
    });
    return row as unknown as EmailThreadRecord | null;
  }

  async findSubjectByThread(threadId: string): Promise<string | null> {
    // lib/email-subject.ts:109
    const row = await prisma.emailThread.findUnique({
      where: { threadId },
      select: { subject: true },
    });
    return row?.subject ?? null;
  }

  async findSequenceContactByThread(
    threadId: string
  ): Promise<{ sequenceId: string; contactId: string } | null> {
    // pubsub/helper.ts:224
    const row = await prisma.emailThread.findUnique({
      where: { threadId },
      select: { sequenceId: true, contactId: true },
    });
    return row as { sequenceId: string; contactId: string } | null;
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
    // jobs/email/processor.ts:252
    const row = await prisma.emailThread.create({
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
  }

  async findManyForChecking(
    where: Record<string, unknown>,
    take: number
  ): Promise<EmailThreadWithSequence[]> {
    // jobs/thread-watch/processor.ts:336 — where is built by the caller.
    const rows = await prisma.emailThread.findMany({
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
  }

  async updateCheckMetadata(
    threadId: string,
    lastCheckedAt: Date,
    metadata: Record<string, unknown>
  ): Promise<void> {
    // jobs/thread-watch/processor.ts:828 (updateThreadMetadata)
    await prisma.emailThread.update({
      where: { threadId },
      data: {
        lastCheckedAt,
        metadata: metadata as any,
      },
    });
  }

  async markCompleted(
    threadId: string,
    existingMetadata: Record<string, unknown> | null,
    reason: string,
    at: Date
  ): Promise<void> {
    // jobs/thread-watch/processor.ts:499 — merges existing metadata.
    await prisma.emailThread.update({
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
  }
}
