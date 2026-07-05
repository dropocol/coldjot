import { prisma } from "@coldjot/database";
import type { ListRepository } from "../list.repo";

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
}
