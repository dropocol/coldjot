import { prisma } from "@coldjot/database";
import { sleep } from "@/utils";
import { google } from "googleapis";

export interface GoogleAccount {
  access_token: string;
  refresh_token: string;
  providerAccountId: string;
  userId: string;
}

export async function getGoogleAccount(
  userId: string
): Promise<GoogleAccount | null> {
  const account = await prisma.account.findFirst({
    where: {
      userId: userId,
      provider: "google",
    },
    select: {
      userId: true,
      access_token: true,
      refresh_token: true,
      providerAccountId: true,
    },
  });

  if (
    !account?.access_token ||
    !account?.refresh_token ||
    !account?.providerAccountId
  ) {
    return null;
  }

  return {
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    providerAccountId: account.providerAccountId,
    userId: account.userId,
  };
}

// Configure Gmail OAuth2 client
export const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.AUTH_URL}/api/auth/callback/google`
);

// Configure Gmail OAuth2 client for email operations
export const oauth2ClientEmail = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID_EMAIL,
  process.env.GOOGLE_CLIENT_SECRET_EMAIL,
  process.env.GOOGLE_REDIRECT_URI_EMAIL
);

interface TokenRefreshError extends Error {
  code?: string;
  status?: number;
}

export async function refreshAccessToken(
  userId: string,
  refreshToken: string,
  maxRetries = 3
): Promise<string | null> {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      oauth2Client.setCredentials({
        refresh_token: refreshToken,
      });

      const { credentials } = await oauth2Client.refreshAccessToken();

      if (!credentials.access_token) {
        throw new Error("No access token returned");
      }

      console.log(`🔄 Token refreshed successfully on attempt ${attempt + 1}`);

      // Save the new access token
      console.log(`🔄 Finding account for user ${userId}`);
      const account = await prisma.account.findFirst({
        where: {
          userId: userId,
        },
      });
      console.log(`🔄 Account found: ${account?.id}`);

      if (!account) {
        console.error(`❌ Account not found for user ${userId}`);
        return null;
        // throw new Error("Account not found");
      }

      console.log(
        `🔄 Updating account ${account.id} : ${userId} with new access token`
      );

      try {
        const updatedAccount = await prisma.account.update({
          where: { id: account.id },
          data: {
            access_token: credentials.access_token,
            expires_at: credentials.expiry_date
              ? credentials.expiry_date / 1000
              : null,
            // id_token: credentials.id_token,
          },
        });
        console.log(`🔄 Updated account: ${updatedAccount}`);
      } catch (error) {
        console.error(`❌ Error updating account: ${error}`);
      }

      return credentials.access_token;
    } catch (error) {
      attempt++;
      const err = error as TokenRefreshError;

      // Log the error details
      console.error(`❌ Token refresh attempt ${attempt} failed:`, {
        error: err.message,
        code: err.code,
        status: err.status,
      });

      console.log(`🔄 Attempt ${attempt} failed`);
      console.log(userId);
      console.log(refreshToken);
      console.log(maxRetries);

      // If we've exhausted all retries, throw the error
      if (attempt === maxRetries) {
        console.error(`❌ Token refresh failed after ${maxRetries} attempts`);
        throw new Error(`Failed to refresh token: ${err.message}`);
      }

      // Calculate delay with exponential backoff (1s, 2s, 4s, etc.)
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      console.log(`⏳ Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  return null;
}

export async function refreshEmailAccessToken(
  userId: string,
  refreshToken: string,
  maxRetries = 3
): Promise<string | null> {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      oauth2ClientEmail.setCredentials({
        refresh_token: refreshToken,
      });

      const { credentials } = await oauth2ClientEmail.refreshAccessToken();

      if (!credentials.access_token) {
        throw new Error("No access token returned");
      }

      console.log(
        `🔄 Email token refreshed successfully on attempt ${attempt + 1}`
      );

      // Save the new access token
      console.log(`🔄 Finding mailbox for user ${userId}`);
      const mailbox = await prisma.mailbox.findFirst({
        where: {
          userId: userId,
        },
      });
      console.log(`🔄 Mailbox found: ${mailbox?.id}`);

      if (!mailbox) {
        console.error(`❌ Mailbox not found for user ${userId}`);
        return null;
      }

      console.log(
        `🔄 Updating mailbox ${mailbox.id} : ${userId} with new access token`
      );

      try {
        const updatedMailbox = await prisma.mailbox.update({
          where: { id: mailbox.id },
          data: {
            access_token: credentials.access_token,
            expires_at: credentials.expiry_date
              ? Math.floor(credentials.expiry_date / 1000)
              : null,
          },
        });
        console.log(`🔄 Updated mailbox: ${updatedMailbox.id}`);
      } catch (error) {
        console.error(`❌ Error updating mailbox: ${error}`);
      }

      return credentials.access_token;
    } catch (error) {
      attempt++;
      const err = error as TokenRefreshError;

      // Log the error details
      console.error(`❌ Email token refresh attempt ${attempt} failed:`, {
        error: err.message,
        code: err.code,
        status: err.status,
      });

      console.log(`🔄 Attempt ${attempt} failed`);
      console.log(userId);
      console.log(refreshToken);
      console.log(maxRetries);

      // If we've exhausted all retries, throw the error
      if (attempt === maxRetries) {
        console.error(
          `❌ Email token refresh failed after ${maxRetries} attempts`
        );
        throw new Error(`Failed to refresh email token: ${err.message}`);
      }

      // Calculate delay with exponential backoff (1s, 2s, 4s, etc.)
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      console.log(`⏳ Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  return null;
}
