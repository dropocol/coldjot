import { prisma } from "@coldjot/database";
import type {
  EmailWatchRepository,
  EmailWatchRecord,
} from "../email-watch.repo";

export class PrismaEmailWatchRepository implements EmailWatchRepository {
  async findById(id: string): Promise<EmailWatchRecord | null> {
    // pubsub/helper.ts:152 + watch/index.ts:232 + watch/debug.ts
    const row = await prisma.emailWatch.findUnique({ where: { id } });
    return row as unknown as EmailWatchRecord | null;
  }

  async findByEmail(email: string): Promise<EmailWatchRecord | null> {
    // pubsub/handler.ts:141 + watch/index.ts:178,273 + watch/debug.ts
    const row = await prisma.emailWatch.findUnique({ where: { email } });
    return row as unknown as EmailWatchRecord | null;
  }

  async findDueForRenewal(buffer: Date): Promise<EmailWatchRecord[]> {
    // watch/cleanup.ts:99
    const rows = await prisma.emailWatch.findMany({
      where: { expiration: { lte: buffer } },
    });
    return rows as unknown as EmailWatchRecord[];
  }

  async listAll(): Promise<EmailWatchRecord[]> {
    // watch/cleanup.ts:109 (dev dump)
    const rows = await prisma.emailWatch.findMany();
    return rows as unknown as EmailWatchRecord[];
  }

  async create(input: {
    id: string;
    userId: string;
    email: string;
    historyId: string;
    expiration: Date;
  }): Promise<EmailWatchRecord> {
    // watch/index.ts:199
    const row = await prisma.emailWatch.create({ data: input });
    return row as unknown as EmailWatchRecord;
  }

  async updateById(
    id: string,
    data: { historyId?: string; expiration?: Date }
  ): Promise<void> {
    // pubsub/handler.ts:410,454 + watch/index.ts:255
    await prisma.emailWatch.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
    });
  }

  async updateByEmail(
    email: string,
    data: { historyId?: string; expiration?: Date }
  ): Promise<void> {
    // watch/index.ts:183
    await prisma.emailWatch.update({
      where: { email },
      data: { ...data, updatedAt: new Date() },
    });
  }

  async deleteByEmail(email: string): Promise<void> {
    // watch/index.ts:310
    await prisma.emailWatch.delete({ where: { email } });
  }
}
