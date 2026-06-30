import { NextResponse } from "next/server";
import { google } from "googleapis";
import { prisma } from "@coldjot/database";
import { decrypt } from "@/lib/crypto";
import { logger } from "@/lib/logger";

// Verify credentials are loaded
if (
  !process.env.GOOGLE_CLIENT_ID_EMAIL ||
  !process.env.GOOGLE_CLIENT_SECRET_EMAIL
) {
  console.error("Missing Gmail OAuth credentials for email accounts");
  throw new Error("Missing Gmail OAuth credentials for email accounts");
}

interface GmailSendAs {
  sendAsEmail: string;
  displayName?: string;
  isPrimary?: boolean;
  verificationStatus?: string;
  isDefault?: boolean;
}

interface StateData {
  userId: string;
  returnPath: string;
}

async function fetchAndSaveAliases(gmail: any, mailboxId: string) {
  try {
    // Fetch Gmail settings including send-as aliases
    const { data: settings } = await gmail.users.settings.sendAs.list({
      userId: "me",
    });

    // Get existing aliases for this account
    const existingAliases = await prisma.emailAlias.findMany({
      where: { mailboxId: mailboxId },
      select: { alias: true },
    });
    const existingAliasEmails = new Set(existingAliases.map((a) => a.alias));

    // Filter out primary email and prepare alias data
    const aliasesToCreate =
      settings.sendAs
        ?.filter(
          (sendAs: GmailSendAs) =>
            !sendAs.isPrimary && !existingAliasEmails.has(sendAs.sendAsEmail)
        )
        .map((sendAs: GmailSendAs) => ({
          alias: sendAs.sendAsEmail,
          name: sendAs.displayName || null,
          mailboxId: mailboxId,
        })) || [];

    // Create new aliases in bulk
    if (aliasesToCreate.length > 0) {
      await prisma.emailAlias.createMany({
        data: aliasesToCreate,
      });
    }

    logger.info({ count: aliasesToCreate.length }, "saved gmail aliases");
  } catch (error: any) {
    logger.error("[GMAIL_CALLBACK] Failed to fetch/save aliases:", {
      message: error.message,
    });
    // Don't throw - we don't want to fail the whole callback if alias fetching fails
  }
}

export async function GET(request: Request) {
  const oauth2Client = await new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID_EMAIL,
    process.env.GOOGLE_CLIENT_SECRET_EMAIL,
    process.env.GOOGLE_REDIRECT_URI_EMAIL
  );

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      logger.error("[GMAIL_CALLBACK] OAuth error:", error);
      return Response.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings/mailboxes?error=gmail_auth_failed&reason=${error}`
      );
    }

    if (!code || !state) {
      logger.error("[GMAIL_CALLBACK] Missing code or state");
      return Response.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings/mailboxes?error=invalid_request`
      );
    }

    // Decrypt and parse state
    const decryptedState = decrypt(state);
    const { userId, returnPath } = JSON.parse(decryptedState) as StateData;

    try {
      // Get tokens from code
      const { tokens } = await oauth2Client.getToken(code);
      await oauth2Client.setCredentials(tokens);

      // Get user info from Google
      const oauth2 = google.oauth2("v2");
      const { data: userInfo } = await oauth2.userinfo.get({
        auth: oauth2Client,
      });

      if (!userInfo.email) {
        throw new Error("No email found in Google account");
      }

      // Check if this email is already connected
      const existingAccount = await prisma.mailbox.findUnique({
        where: {
          userId_email: {
            userId,
            email: userInfo.email,
          },
        },
      });

      let accountId: string;
      if (existingAccount) {
        // Update existing account
        await prisma.mailbox.update({
          where: { id: existingAccount.id },
          data: {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: tokens.expiry_date
              ? Math.floor(tokens.expiry_date / 1000)
              : null,
            name: userInfo.name || null,
            type: "oauth",
            token_type: tokens.token_type || null,
            scope: tokens.scope || null,
            id_token: tokens.id_token || null,
            providerAccountId: userInfo.id || "",
          },
        });
        accountId = existingAccount.id;
        logger.info("updated existing mailbox");
      } else {
        // Create new account
        const createdAccount = await prisma.mailbox.create({
          data: {
            userId,
            email: userInfo.email,
            name: userInfo.name || null,
            provider: "gmail",
            type: "oauth",
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: tokens.expiry_date
              ? Math.floor(tokens.expiry_date / 1000)
              : null,
            token_type: tokens.token_type || null,
            scope: tokens.scope || null,
            id_token: tokens.id_token || null,
            providerAccountId: userInfo.id || "",
          },
        });
        accountId = createdAccount.id;
        logger.info("created new mailbox");
      }

      // After creating/updating the account, fetch and save aliases
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });
      await fetchAndSaveAliases(gmail, accountId);

      // Send a request to mailops to setup watch
      const watchResponse = await fetch(
        `${process.env.NEXT_PUBLIC_MAILOPS_API_URL}/mailbox/watch`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId, email: userInfo.email }),
        }
      );

      if (!watchResponse.ok) {
        const watchError = await watchResponse.json();
        logger.error("[GMAIL_CALLBACK] Failed to setup watch:", watchError);
        // Continue with the flow even if watch setup fails
      }

      // Redirect back to the return path with success message
      return Response.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}${returnPath}?success=gmail_connected`
      );
    } catch (tokenError: any) {
      logger.error("[GMAIL_CALLBACK] Token Error:", tokenError.message);
      return Response.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings?error=gmail_auth_failed&reason=token_error`
      );
    }
  } catch (error: any) {
    logger.error("[GMAIL_CALLBACK] Error:", error.message);
    return Response.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?error=gmail_auth_failed&reason=unexpected_error`
    );
  }
}
