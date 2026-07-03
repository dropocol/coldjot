import { prisma } from "@coldjot/database";
import { sleep } from "@/utils";
import { google } from "googleapis";
import { logger } from "@/lib/logger";

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

      logger.debug(`Token refreshed successfully on attempt ${attempt + 1}`);

      // Save the new access token
      logger.debug(`Finding account for user ${userId}`);
      const account = await prisma.account.findFirst({
        where: {
          userId: userId,
        },
      });
      logger.debug(`Account found: ${account?.id}`);

      if (!account) {
        logger.error(`Account not found for user ${userId}`);
        return null;
        // throw new Error("Account not found");
      }

      logger.debug(
        `Updating account ${account.id} for user ${userId} with new access token`
      );

      try {
        await prisma.account.update({
          where: { id: account.id },
          data: {
            access_token: credentials.access_token,
            expires_at: credentials.expiry_date
              ? credentials.expiry_date / 1000
              : null,
            // id_token: credentials.id_token,
          },
        });
      } catch (error) {
        logger.error(`Error updating account: ${error}`);
      }

      return credentials.access_token;
    } catch (error) {
      attempt++;
      const err = error as TokenRefreshError;

      // Log the error details (no token values)
      logger.error(`Token refresh attempt ${attempt} failed:`, {
        error: err.message,
        code: err.code,
        status: err.status,
      });

      // If we've exhausted all retries, throw the error
      if (attempt === maxRetries) {
        logger.error(`Token refresh failed after ${maxRetries} attempts`);
        throw new Error(`Failed to refresh token: ${err.message}`, {
          cause: error,
        });
      }

      // Calculate delay with exponential backoff (1s, 2s, 4s, etc.)
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      logger.debug(`Retrying in ${delay}ms...`);
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

      logger.debug(
        `Email token refreshed successfully on attempt ${attempt + 1}`
      );

      // Save the new access token
      logger.debug(`Finding mailbox for user ${userId}`);
      const mailbox = await prisma.mailbox.findFirst({
        where: {
          userId: userId,
        },
      });
      logger.debug(`Mailbox found: ${mailbox?.id}`);

      if (!mailbox) {
        logger.error(`Mailbox not found for user ${userId}`);
        return null;
      }

      logger.debug(
        `Updating mailbox ${mailbox.id} for user ${userId} with new access token`
      );

      try {
        await prisma.mailbox.update({
          where: { id: mailbox.id },
          data: {
            access_token: credentials.access_token,
            expires_at: credentials.expiry_date
              ? Math.floor(credentials.expiry_date / 1000)
              : null,
          },
        });
      } catch (error) {
        logger.error(`Error updating mailbox: ${error}`);
      }

      return credentials.access_token;
    } catch (error) {
      attempt++;
      const err = error as TokenRefreshError;

      // Log the error details (no token values)
      logger.error(`Email token refresh attempt ${attempt} failed:`, {
        error: err.message,
        code: err.code,
        status: err.status,
      });

      // If we've exhausted all retries, throw the error
      if (attempt === maxRetries) {
        logger.error(
          `Email token refresh failed after ${maxRetries} attempts`
        );
        throw new Error(`Failed to refresh email token: ${err.message}`, {
          cause: error,
        });
      }

      // Calculate delay with exponential backoff (1s, 2s, 4s, etc.)
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      logger.debug(`Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  return null;
}
