import { prisma } from "@coldjot/database";
import type {
  TemplateRepository,
  TemplateRecord,
} from "../template.repo";

export class PrismaTemplateRepository implements TemplateRepository {
  async findSubject(id: string): Promise<string | null> {
    // lib/email-subject.ts:71,196,238,258,291
    const row = await prisma.template.findUnique({
      where: { id },
      select: { subject: true },
    });
    return row?.subject ?? null;
  }

  async findById(id: string): Promise<TemplateRecord | null> {
    // jobs/email/processor.ts:99
    const row = await prisma.template.findUnique({ where: { id } });
    return row as unknown as TemplateRecord | null;
  }
}
