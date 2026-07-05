import { prisma } from "@coldjot/database";
import type { EmailEventEnum } from "@coldjot/types";
import type {
  EmailEventRepository,
  EmailEventRecord,
  CreateEventInput,
} from "../email-event.repo";

export class PrismaEmailEventRepository implements EmailEventRepository {
  async create(input: CreateEventInput): Promise<EmailEventRecord> {
    // lib/tracking/index.ts:123,417,771 + handler.ts:951,1116
    const row = await prisma.emailEvent.create({
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
  }

  async findFirstByTrackingAndType(
    trackingId: string,
    type: EmailEventEnum
  ): Promise<EmailEventRecord | null> {
    // lib/tracking/index.ts:102
    const row = await prisma.emailEvent.findFirst({
      where: { trackingId, type },
    });
    return row as unknown as EmailEventRecord | null;
  }

  async findFirstByTrackingTypeSequence(
    trackingId: string,
    type: EmailEventEnum,
    sequenceId: string
  ): Promise<EmailEventRecord | null> {
    // lib/tracking/index.ts:402
    const row = await prisma.emailEvent.findFirst({
      where: { trackingId, type, sequenceId },
    });
    return row as unknown as EmailEventRecord | null;
  }

  async findFirstBySequenceContactType(
    sequenceId: string,
    contactId: string,
    type: EmailEventEnum
  ): Promise<EmailEventRecord | null> {
    // handler.ts:907,1072 + thread-watch/processor.ts:665,735
    const row = await prisma.emailEvent.findFirst({
      where: { sequenceId, contactId, type },
    });
    return row as unknown as EmailEventRecord | null;
  }

  async countBySequenceContactType(
    sequenceId: string,
    contactId: string,
    type: EmailEventEnum
  ): Promise<number> {
    // lib/stats/index.ts:35
    return prisma.emailEvent.count({
      where: { sequenceId, contactId, type },
    });
  }

  async existsBySequenceContactInTypes(
    sequenceId: string,
    contactId: string,
    types: EmailEventEnum[]
  ): Promise<boolean> {
    // services/jobs/email/processor.ts:468
    const rows = await prisma.emailEvent.findMany({
      where: { sequenceId, contactId, type: { in: types as string[] } },
    });
    return rows.length > 0;
  }

  async listByTracking(trackingId: string): Promise<EmailEventRecord[]> {
    // lib/tracking/index.ts:351
    const rows = await prisma.emailEvent.findMany({
      where: { trackingId },
      orderBy: { timestamp: "desc" },
    });
    return rows as unknown as EmailEventRecord[];
  }

  async deleteBySequence(sequenceId: string): Promise<void> {
    // services/jobs/sequence/helper.ts:195
    await prisma.emailEvent.deleteMany({ where: { sequenceId } });
  }
}
