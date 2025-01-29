import { prisma } from "@coldjot/database";
import { EmailAlias, Mailbox, MailboxCredentials } from "@coldjot/types";

export async function getSequenceMailboxId(
  sequenceId: string
): Promise<string | null> {
  const mailbox = await prisma.sequenceMailbox.findUnique({
    where: { sequenceId: sequenceId },
  });
  if (!mailbox) {
    throw new Error("Sequence mailbox not found");
  }
  return mailbox.mailboxId;
}

/**
 * Get user's mailbox details
 */
export async function getSenderMailbox(
  userId: string,
  mailboxId: string
): Promise<Mailbox | null> {
  const mailbox = await prisma.mailbox.findUnique({
    where: { id: mailboxId, userId: userId },
    include: {
      aliases: true,
    },
  });

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
  const sequenceMailbox = await prisma.sequenceMailbox.findUnique({
    where: {
      id,
    },
    include: {
      alias: true,
      mailbox: true,
    },
  });

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

  const sequenceMailbox = await prisma.sequenceMailbox.findUnique({
    where: {
      sequenceId: sequenceId,
      mailboxId: sequenceMailboxId,
      userId: userId,
    },
    include: {
      alias: true,
      mailbox: true,
    },
  });

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
    const updatedMailbox = await prisma.mailbox.update({
      where: { id: mailboxId },
      data: {
        access_token: data.accessToken,
        expires_at: data.expiryDate ? data.expiryDate / 1000 : null,
        // id_token: credentials.id_token,
      },
    });
    console.log(`🔄 Updated mailbox: ${updatedMailbox}`);
  } catch (error) {
    console.error(`❌ Error updating mailbox: ${error}`);
  }
}
