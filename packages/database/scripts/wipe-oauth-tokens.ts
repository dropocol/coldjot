/**
 * One-off: wipe plaintext OAuth tokens from the Mailbox and Account tables.
 *
 * Context: tokens were historically stored in plaintext. After deploying the
 * token-encryption Prisma extension (packages/database/src/index.ts), NEW
 * writes are encrypted at rest — but existing rows still hold plaintext.
 *
 * Because this system has a single user who can simply re-authenticate, the
 * simplest correct migration is to WIPE the existing tokens entirely. On the
 * next Gmail OAuth login, the extension stores fresh tokens encrypted.
 *
 * Run with Node, against the target environment's DATABASE_URL:
 *   DATABASE_URL=postgresql://... node --import tsx packages/database/scripts/wipe-oauth-tokens.ts
 *
 * Safety:
 * - Uses a RAW PrismaClient (no $extends) so it does NOT try to decrypt the
 *   plaintext values it reads.
 * - DRY_RUN=1 (default) prints what it would do without writing. Re-run with
 *   DRY_RUN=0 to apply.
 */
import { PrismaClient } from "@prisma/client";

const DRY_RUN = process.env.DRY_RUN !== "0";

async function main() {
  // Raw client — bypasses the encryption extension on purpose.
  const prisma = new PrismaClient();

  try {
    const mailboxes = await prisma.mailbox.count({
      where: { OR: [{ access_token: { not: null } }, { refresh_token: { not: null } }, { id_token: { not: null } }] },
    });
    const accounts = await prisma.account.count({
      where: { OR: [{ access_token: { not: null } }, { refresh_token: { not: null } }, { id_token: { not: null } }] },
    });

    console.log(`Found token-bearing rows: ${mailboxes} mailbox(ies), ${accounts} account(s).`);
    console.log(`Mode: ${DRY_RUN ? "DRY_RUN (no writes)" : "APPLY (will wipe tokens)"}`);

    if (DRY_RUN) {
      console.log("\nRe-run with DRY_RUN=0 to actually clear the tokens.");
      console.log("After wiping, the user must re-authenticate each mailbox/account via Gmail OAuth.");
      return;
    }

    // Wipe token fields on both tables.
    const m = await prisma.mailbox.updateMany({
      where: { OR: [{ access_token: { not: null } }, { refresh_token: { not: null } }, { id_token: { not: null } }] },
      data: { access_token: null, refresh_token: null, id_token: null },
    });
    const a = await prisma.account.updateMany({
      where: { OR: [{ access_token: { not: null } }, { refresh_token: { not: null } }, { id_token: { not: null } }] },
      data: { access_token: null, refresh_token: null, id_token: null },
    });

    console.log(`\nDone. Cleared tokens on ${m.count} mailbox(ies) and ${a.count} account(s).`);
    console.log("Users must now re-authenticate. New tokens will be stored encrypted at rest.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Wipe failed:", err);
  process.exit(1);
});
