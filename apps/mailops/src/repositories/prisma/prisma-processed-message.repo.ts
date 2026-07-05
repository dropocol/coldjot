import { prisma } from "@coldjot/database";
import type {
  ProcessedMessageRepository,
  ProcessedMessageRecord,
} from "../processed-message.repo";

export class PrismaProcessedMessageRepository
  implements ProcessedMessageRepository
{
  async findByMessageId(messageId: string): Promise<ProcessedMessageRecord | null> {
    // pubsub/helper.ts:211
    const row = await prisma.processedMessage.findUnique({ where: { messageId } });
    return row as unknown as ProcessedMessageRecord | null;
  }

  async create(input: {
    messageId: string;
    threadId: string;
    type: string;
  }): Promise<ProcessedMessageRecord> {
    // pubsub/helper.ts:266,345
    const row = await prisma.processedMessage.create({ data: input });
    return row as unknown as ProcessedMessageRecord;
  }

  async hasOriginalForThread(threadId: string): Promise<boolean> {
    // pubsub/helper.ts:412 — isOriginalMessage
    const rows = await prisma.processedMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
      take: 1,
    });
    return rows.length > 0;
  }
}
