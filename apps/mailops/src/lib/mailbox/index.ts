import { EmailAlias, Mailbox, MailboxCredentials } from "@coldjot/types";
import { PrismaMailboxRepository } from "@/repositories/prisma/prisma-mailbox.repo";

// Module-level repository singleton — bridges the standalone fns until Phase 4
// turns these into a proper MailboxService with constructor injection. Matches
// the same stopgap pattern used in lib/tracking.
const mailboxRepo = new PrismaMailboxRepository();

export async function getSequenceMailboxId(
  sequenceId: string
): Promise<string | null> {
  const mailboxId = await mailboxRepo.findSequenceMailboxId(sequenceId);
  if (!mailboxId) {
    // throw new Error("Sequence mailbox not found");
    return null;
  }
  return mailboxId;
}

/**
 * Get user's mailbox details
 */
export async function getSenderMailbox(
  userId: string,
  mailboxId: string
): Promise<Mailbox | null> {
  const mailbox = await mailboxRepo.findWithAliases(mailboxId, userId);

  if (
    !mailbox?.providerAccountId ||
    !mailbox?.access_token ||
    !mailbox?.refresh_token
  ) {
    return null;
  }

  return {
    id: mailbox.id,
    name: mailbox.name || "",
    email: mailbox.email || "",
    accessToken: mailbox.access_token,
    refreshToken: mailbox.refresh_token,
    expiryDate: mailbox.expires_at || 0,
    // aliases: mailbox.aliases,
    // defaultAliasId: mailbox.defaultAliasId || undefined,
  };
}

/**
 * Get sequence mailbox details
 */
export async function getSequenceMailboxWithId(
  id: string
): Promise<Mailbox | null> {
  console.log("🔍 Getting sequence mailbox with id", id);
  const sequenceMailbox = await mailboxRepo.findSequenceMailboxById(id);

  if (
    !sequenceMailbox?.mailbox.providerAccountId ||
    !sequenceMailbox?.mailbox.access_token ||
    !sequenceMailbox?.mailbox.refresh_token
  ) {
    return null;
  }

  return {
    id: sequenceMailbox.mailbox.id,
    name: sequenceMailbox.alias?.name || sequenceMailbox.mailbox.name || "",
    email: sequenceMailbox.alias?.alias || sequenceMailbox.mailbox.email || "",
    accessToken: sequenceMailbox.mailbox.access_token,
    refreshToken: sequenceMailbox.mailbox.refresh_token,
    expiryDate: sequenceMailbox.mailbox.expires_at || 0,
  };
}

/**
 * Get sequence mailbox details
 */
export async function getSequenceMailbox(
  sequenceMailboxId: string,
  sequenceId: string,
  userId: string
): Promise<Mailbox | null> {
  console.log(
    "🔍 Getting sequence mailbox",
    sequenceMailboxId,
    sequenceId,
    userId
  );

  const sequenceMailbox = await mailboxRepo.findSequenceMailbox(
    sequenceMailboxId,
    sequenceId,
    userId
  );

  if (
    !sequenceMailbox?.mailbox.providerAccountId ||
    !sequenceMailbox?.mailbox.access_token ||
    !sequenceMailbox?.mailbox.refresh_token
  ) {
    return null;
  }

  return {
    id: sequenceMailbox.mailbox.id,
    name: sequenceMailbox.alias?.name || sequenceMailbox.mailbox.name || "",
    email: sequenceMailbox.alias?.alias || sequenceMailbox.mailbox.email || "",
    accessToken: sequenceMailbox.mailbox.access_token,
    refreshToken: sequenceMailbox.mailbox.refresh_token,
    expiryDate: sequenceMailbox.mailbox.expires_at || 0,
  };
}

/**
 * Update mailbox details
 */
export async function updateMailboxCredentials(
  mailboxId: string,
  data: Partial<MailboxCredentials>
) {
  try {
    await mailboxRepo.updateTokens(
      mailboxId,
      data.accessToken!,
      data.expiryDate!
    );
    console.log(`🔄 Updated mailbox: ${mailboxId}`);
  } catch (error) {
    console.error(`❌ Error updating mailbox: ${error}`);
  }
}
