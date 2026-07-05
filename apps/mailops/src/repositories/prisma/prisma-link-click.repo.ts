import { prisma } from "@coldjot/database";
import type {
  LinkClickRepository,
  LinkClickRecord,
} from "../link-click.repo";

export class PrismaLinkClickRepository implements LinkClickRepository {
  async create(trackedLinkId: string, timestamp: Date): Promise<LinkClickRecord> {
    // lib/tracking/index.ts:168,697
    const row = await prisma.linkClick.create({
      data: { trackedLinkId, timestamp },
    });
    return row as unknown as LinkClickRecord;
  }
}
