import { prisma } from "@coldjot/database";
import type {
  SequenceRepository,
  SequenceRecord,
  SequenceWithLaunchGraph,
  SequenceWithDetails,
} from "../sequence.repo";

export class PrismaSequenceRepository implements SequenceRepository {
  async findByIdForUser(
    id: string,
    userId: string
  ): Promise<SequenceRecord | null> {
    // sequence/controller.ts:166,199,232 + pubsub/helper.ts:311
    const row = await prisma.sequence.findUnique({ where: { id, userId } });
    return row as unknown as SequenceRecord | null;
  }

  async findForLaunch(
    id: string,
    userId: string,
    excludeStatuses: string[]
  ): Promise<SequenceWithLaunchGraph | null> {
    // sequence/controller.ts:81
    const row = await prisma.sequence.findUnique({
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
  }

  async findWithDetails(id: string): Promise<SequenceWithDetails | null> {
    // jobs/sequence/helper.ts:149
    const row = await prisma.sequence.findUnique({
      where: { id },
      include: {
        sequenceMailbox: true,
        steps: { orderBy: { order: "asc" } },
        businessHours: true,
      },
    });
    if (!row) return null;
    // Keep both the nested sequenceMailbox (legacy consumers) and the
    // flattened sequenceMailboxId (new consumers).
    return {
      ...row,
      sequenceMailboxId: (row as any).sequenceMailbox?.id,
    } as unknown as SequenceWithDetails;
  }

  async findWithBusinessHours(
    id: string
  ): Promise<{ businessHours: any } | null> {
    // jobs/email/processor.ts:354
    return prisma.sequence.findUnique({
      where: { id },
      include: { businessHours: true },
    }) as Promise<{ businessHours: any } | null>;
  }

  async setStatus(id: string, status: string): Promise<void> {
    // sequence/controller.ts:120,178,211
    await prisma.sequence.update({ where: { id }, data: { status } });
  }

  async resetToDraft(id: string): Promise<void> {
    // sequence/controller.ts:256
    await prisma.sequence.update({
      where: { id },
      data: { status: "draft", testMode: false, disableSending: false },
    });
  }
}
