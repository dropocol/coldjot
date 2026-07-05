import { prisma } from "@coldjot/database";
import type {
  MailboxAliasRecord,
  MailboxRecord,
  MailboxRepository,
  MailboxWithAliasesRecord,
  SequenceMailboxRow,
} from "../mailbox.repo";

export class PrismaMailboxRepository implements MailboxRepository {
  async findWithAliases(
    id: string,
    userId: string
  ): Promise<MailboxWithAliasesRecord | null> {
    // lib/mailbox/index.ts:24
    const row = await prisma.mailbox.findUnique({
      where: { id, userId },
      include: { aliases: true },
    });
    return row as unknown as MailboxWithAliasesRecord | null;
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
    // controllers/mailbox.controller.ts:58
    const row = await prisma.mailbox.findFirst({
      where: { userId, email, isActive: true, provider: "gmail" },
    });
    return row as unknown as MailboxRecord | null;
  }

  async findActiveGmailByEmail(email: string): Promise<MailboxRecord | null> {
    // services/watch/index.ts:283,350
    const row = await prisma.mailbox.findFirst({
      where: { email, isActive: true, provider: "gmail" },
    });
    return row as unknown as MailboxRecord | null;
  }

  async findWithEmailAliases(email: string): Promise<MailboxWithAliasesRecord | null> {
    // pubsub/handler.ts:154
    const row = await prisma.mailbox.findFirst({
      where: { email },
      include: { aliases: true },
    });
    return row as unknown as MailboxWithAliasesRecord | null;
  }

  async updateTokens(
    id: string,
    accessToken: string,
    expiresAtMs: number
  ): Promise<void> {
    // lib/mailbox/index.ts:139 — expires_at is stored as Int epoch seconds.
    await prisma.mailbox.update({
      where: { id },
      data: {
        access_token: accessToken,
        expires_at: expiresAtMs ? expiresAtMs / 1000 : null,
      },
    });
  }

  // -- SequenceMailbox join table ------------------------------------------

  async findSequenceMailboxId(sequenceId: string): Promise<string | null> {
    // lib/mailbox/index.ts:7 (getSequenceMailboxId)
    const row = await prisma.sequenceMailbox.findUnique({
      where: { sequenceId },
    });
    return row?.mailboxId ?? null;
  }

  async findSequenceMailboxById(id: string): Promise<SequenceMailboxRow | null> {
    // lib/mailbox/index.ts:58 (getSequenceMailboxWithId)
    const row = await prisma.sequenceMailbox.findUnique({
      where: { id },
      include: { alias: true, mailbox: true },
    });
    return row as unknown as SequenceMailboxRow | null;
  }

  async findSequenceMailbox(
    sequenceMailboxId: string,
    sequenceId: string,
    userId: string
  ): Promise<SequenceMailboxRow | null> {
    // lib/mailbox/index.ts:101 (getSequenceMailbox — currently unused).
    // sequenceId is @unique, so findUnique accepts the extra fields as filters.
    const row = await prisma.sequenceMailbox.findUnique({
      where: {
        sequenceId,
        mailboxId: sequenceMailboxId,
        userId,
      },
      include: { alias: true, mailbox: true },
    });
    return row as unknown as SequenceMailboxRow | null;
  }
}

/** Narrow a raw Prisma alias row to the MailboxAliasRecord shape. */
export function toAliasRecord(row: any): MailboxAliasRecord {
  return { id: row.id, alias: row.alias, name: row.name };
}
