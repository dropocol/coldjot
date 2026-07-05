import { prisma } from "@coldjot/database";
import type {
  EmailWatchHistoryRepository,
  EmailWatchHistoryRecord,
} from "../email-watch-history.repo";

export class PrismaEmailWatchHistoryRepository
  implements EmailWatchHistoryRepository
{
  async findProcessed(
    emailWatchId: string,
    historyId: string
  ): Promise<EmailWatchHistoryRecord | null> {
    // pubsub/helper.ts:180
    const row = await prisma.emailWatchHistory.findFirst({
      where: { emailWatchId, historyId, processed: true },
    });
    return row as unknown as EmailWatchHistoryRecord | null;
  }

  async upsert(input: {
    id: string;
    emailWatchId: string;
    historyId: string;
    notificationType: string;
    processed: boolean;
    data: Record<string, unknown>;
  }): Promise<void> {
    // pubsub/helper.ts:433
    await prisma.emailWatchHistory.upsert({
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
  }

  async create(input: {
    id: string;
    emailWatchId: string;
    historyId: string;
    notificationType: string;
    processed: boolean;
    data: Record<string, unknown>;
  }): Promise<void> {
    // pubsub/handler.ts:205,470 + pubsub/helper.ts:473
    await prisma.emailWatchHistory.create({
      data: {
        id: input.id,
        emailWatchId: input.emailWatchId,
        historyId: input.historyId,
        notificationType: input.notificationType,
        processed: input.processed,
        data: input.data as any,
      },
    });
  }

  async markProcessed(id: string): Promise<void> {
    // pubsub/handler.ts:289
    await prisma.emailWatchHistory.update({
      where: { id },
      data: { processed: true },
    });
  }

  async purgeProcessedBefore(cutoff: Date): Promise<{ count: number }> {
    // watch/cleanup.ts:160
    return prisma.emailWatchHistory.deleteMany({
      where: { createdAt: { lt: cutoff }, processed: true },
    });
  }
}
