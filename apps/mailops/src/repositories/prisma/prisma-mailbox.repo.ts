import { prisma } from "@coldjot/database";
import type {
  MailboxRepository,
  MailboxRecord,
  MailboxWithAliases,
} from "../mailbox.repo";

export class PrismaMailboxRepository implements MailboxRepository {
  async findWithAliases(
    id: string,
    userId: string
  ): Promise<MailboxWithAliases | null> {
    // lib/mailbox/index.ts:24
    const row = await prisma.mailbox.findUnique({
      where: { id, userId },
      include: { aliases: true },
    });
    return row as unknown as MailboxWithAliases | null;
  }

  async findByIdForUser(
    id: string,
    userId: string
  ): Promise<MailboxRecord | null> {
    // lib/google/gmail/gmail.ts:77
    const row = await prisma.mailbox.findUnique({ where: { id, userId } });
    return row as unknown as MailboxRecord | null;
  }

  async findActiveGmail(
    userId: string,
    email: string
  ): Promise<MailboxRecord | null> {
    // routes/mailbox.ts:47 + watch/index.ts:283,350
    const row = await prisma.mailbox.findFirst({
      where: { userId, email, isActive: true, provider: "gmail" },
    });
    return row as unknown as MailboxRecord | null;
  }

  async findWithEmailAliases(email: string): Promise<MailboxWithAliases | null> {
    // pubsub/handler.ts:150
    const row = await prisma.mailbox.findFirst({
      where: { email },
      include: { aliases: true },
    });
    return row as unknown as MailboxWithAliases | null;
  }

  async updateTokens(
    id: string,
    accessToken: string,
    expiresAt: Date
  ): Promise<void> {
    // lib/mailbox/index.ts:139 — expires_at is stored as Int epoch seconds.
    await prisma.mailbox.update({
      where: { id },
      data: {
        access_token: accessToken,
        expires_at: Math.floor(expiresAt.getTime() / 1000),
      },
    });
  }
}
