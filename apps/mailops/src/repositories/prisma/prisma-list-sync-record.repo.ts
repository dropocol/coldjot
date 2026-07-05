import { prisma } from "@coldjot/database";
import type {
  ListSyncRecordRepository,
  ListSyncRecord,
  ListSyncRecordWithCount,
} from "../list-sync-record.repo";

export class PrismaListSyncRecordRepository implements ListSyncRecordRepository {
  async create(input: {
    listId: string;
    sequenceId: string;
  }): Promise<ListSyncRecord> {
    // routes/lists/index.ts:22
    const row = await prisma.listSyncRecord.create({
      data: {
        listId: input.listId,
        sequenceId: input.sequenceId,
        status: "pending",
        contactsAdded: 0,
      },
    });
    return row as unknown as ListSyncRecord;
  }

  async findPending(batchSize: number): Promise<ListSyncRecordWithCount[]> {
    // jobs/list/processor.ts:75
    const rows = await prisma.listSyncRecord.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      take: batchSize,
      include: {
        list: { select: { _count: { select: { contacts: true } } } },
      },
    });
    return rows as unknown as ListSyncRecordWithCount[];
  }

  async updateStatus(
    id: string,
    data: { status: string; contactsAdded?: number; error?: string }
  ): Promise<void> {
    // jobs/list/processor.ts:102,109,117
    await prisma.listSyncRecord.update({ where: { id }, data });
  }

  async updateStatusByListSequence(
    listId: string,
    sequenceId: string,
    data: { status: string; contactsAdded?: number; error?: string }
  ): Promise<void> {
    // jobs/list/helper.ts:143
    await prisma.listSyncRecord.updateMany({
      where: {
        listId,
        sequenceId,
        status: { in: ["pending", "processing"] },
      },
      data: { ...data, updatedAt: new Date() },
    });
  }
}
