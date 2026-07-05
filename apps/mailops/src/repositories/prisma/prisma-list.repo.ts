import { prisma } from "@coldjot/database";
import type {
  ListContactRow,
  ListRepository,
  ListWithSequences,
} from "../list.repo";

export class PrismaListRepository implements ListRepository {
  async contactCount(listId: string): Promise<number> {
    // jobs/list/processor.ts reads this via listSyncRecord.include.list._count.
    // The repository exposes it directly so the call site can migrate.
    const row = await prisma.emailList.findUnique({
      where: { id: listId },
      select: { _count: { select: { contacts: true } } },
    });
    return row?._count?.contacts ?? 0;
  }

  async findWithSequences(listId: string): Promise<ListWithSequences | null> {
    // jobs/list/helper.ts:17 — list + attached sequence ids.
    const row = await prisma.emailList.findUnique({
      where: { id: listId },
      include: {
        sequences: { select: { id: true } },
      },
    });
    return row as unknown as ListWithSequences | null;
  }

  async findContactsPage(
    listId: string,
    take: number,
    skip: number
  ): Promise<ListContactRow[]> {
    // jobs/list/helper.ts:67 — paginated contact fetch for batch sync.
    const row = await prisma.emailList.findUnique({
      where: { id: listId },
      include: {
        contacts: { take, skip },
      },
    });
    return (row?.contacts ?? []) as unknown as ListContactRow[];
  }
}
