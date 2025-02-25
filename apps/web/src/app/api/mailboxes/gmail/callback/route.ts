import { NextResponse } from "next/server";
import { google } from "googleapis";
import { prisma } from "@coldjot/database";
import { decrypt } from "@/lib/crypto";

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

    console.log(`Saved ${aliasesToCreate.length} new aliases`);
  } catch (error: any) {
    console.error("[GMAIL_CALLBACK] Failed to fetch/save aliases:", {
      message: error.message,
      response: error.response?.data,
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
    console.log(oauth2Client);

    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // Log all search params for debugging
    console.log("Callback Parameters:", {
      code: code?.slice(0, 30) + "...",
      state,
      error,
      scope: searchParams.get("scope"),
    });

    if (error) {
      console.error("[GMAIL_CALLBACK] OAuth Error:", error);
      return Response.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings/mailboxes?error=gmail_auth_failed&reason=${error}`
      );
    }

    if (!code || !state) {
      console.error("[GMAIL_CALLBACK] Missing code or state");
      return Response.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings/mailboxes?error=invalid_request`
      );
    }

    // Log OAuth configuration
    console.log("OAuth Configuration:", {
      clientId: process.env.GOOGLE_CLIENT_ID_EMAIL?.slice(0, 30) + "...",
      redirectUri: process.env.GOOGLE_REDIRECT_URI_EMAIL,
    });

    // Decrypt and parse state
    const decryptedState = decrypt(state);
    const { userId, returnPath } = JSON.parse(decryptedState) as StateData;

    try {
      // Get tokens from code
      const { tokens } = await oauth2Client.getToken(code);
      console.log("Tokens:", tokens);

      await oauth2Client.setCredentials(tokens);

      // Log token info (without sensitive data)
      console.log("Token Info:", {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiryDate: tokens.expiry_date,
        tokenType: tokens.token_type,
        scope: tokens.scope,
        idToken: tokens.id_token,
      });

      // Get user info from Google
      const oauth2 = google.oauth2("v2");
      const { data: userInfo } = await oauth2.userinfo.get({
        auth: oauth2Client,
      });

      if (!userInfo.email) {
        throw new Error("No email found in Google account");
      }

      // Log user info (without sensitive data)
      console.log("User Info:", {
        email: userInfo.email,
        hasName: !!userInfo.name,
      });

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
        console.log("Updated existing email account");
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
        console.log("Created new email account");
      }

      // After creating/updating the account, fetch and save aliases
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });
      await fetchAndSaveAliases(gmail, accountId);

      // Send a request to mailops to setup watch
      console.log(
        "Sending request to mailops to setup watch",
        `${process.env.NEXT_PUBLIC_MAILOPS_API_URL}/mailbox/watch`,
        userId,
        userInfo.email
      );
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
        const error = await watchResponse.json();
        console.error("[GMAIL_CALLBACK] Failed to setup watch:", error);
        // Continue with the flow even if watch setup fails
      }

      // Redirect back to the return path with success message
      return Response.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}${returnPath}?success=gmail_connected`
      );
    } catch (tokenError: any) {
      console.error("[GMAIL_CALLBACK] Token Error:", {
        message: tokenError.message,
        response: tokenError.response?.data,
      });
      return Response.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings?error=gmail_auth_failed&reason=token_error`
      );
    }
  } catch (error: any) {
    console.error("[GMAIL_CALLBACK] Error:", {
      message: error.message,
      stack: error.stack,
    });
    return Response.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?error=gmail_auth_failed&reason=unexpected_error`
    );
  }
}
