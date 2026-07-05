import { prisma } from "@coldjot/database";
import type {
  EmailThreadRepository,
  EmailThreadRecord,
} from "../email-thread.repo";

export class PrismaEmailThreadRepository implements EmailThreadRepository {
  async findByThread(
    threadId: string,
    withSequence = false
  ): Promise<EmailThreadRecord | null> {
    // pubsub/handler.ts:878,1043,1315 + thread-watch/processor.ts
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
    // jobs/email/processor.ts:243
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

  async updateMetadata(
    threadId: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    // thread-watch/processor.ts:828
    await prisma.emailThread.update({
      where: { threadId },
      data: { metadata: metadata as any },
    });
  }

  async markCompleted(threadId: string, reason: string, at: Date): Promise<void> {
    // thread-watch/processor.ts:499
    await prisma.emailThread.update({
      where: { threadId },
      data: {
        metadata: { status: "COMPLETED", reason, completedAt: at } as any,
      },
    });
  }
}
