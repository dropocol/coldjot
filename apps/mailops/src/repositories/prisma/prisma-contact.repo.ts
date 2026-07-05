import { prisma } from "@coldjot/database";
import type {
  ContactRepository,
  ContactRecord,
} from "../contact.repo";

export class PrismaContactRepository implements ContactRepository {
  async findById(id: string): Promise<ContactRecord | null> {
    // jobs/email/processor.ts:115
    const row = await prisma.contact.findUnique({ where: { id } });
    return row as unknown as ContactRecord | null;
  }
}
