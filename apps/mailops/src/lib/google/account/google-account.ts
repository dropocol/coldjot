import { sleep } from "@/utils";
import { google } from "googleapis";
import { TokenRefreshError } from "@coldjot/types";
import { getSenderMailbox, updateMailboxCredentials } from "@/lib/mailbox";
import { JOB_RETRY } from "@/config/queue/policy";
import { logger } from "@/lib/log";

// TODO :  halt everything if this fails
export async function refreshAccessToken(
  userId: string,
  mailboxId: string,
  refreshToken: string,
  // Aligned to the shared job-resilience policy (plan 10) so every retry path
  // in mailops uses the same ceiling.
  maxRetries = JOB_RETRY.attempts
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

      logger.info({ attempt: attempt + 1, userId, mailboxId }, "Token refreshed");

      // Save the new access token
      const mailbox = await getSenderMailbox(userId, mailboxId);
      await updateMailboxCredentials(mailboxId, {
        accessToken: credentials.access_token,
        expiryDate: credentials.expiry_date!,
      });

      return credentials.access_token;
    } catch (error) {
      attempt++;
      const err = error as TokenRefreshError;

      logger.warn(
        { attempt, userId, mailboxId, message: err.message, code: err.code, status: err.status },
        "Token refresh attempt failed"
      );

      // If we've exhausted all retries, throw the error
      if (attempt === maxRetries) {
        logger.error({ userId, mailboxId, attempts: attempt }, "Token refresh failed after retries");
        throw new Error(`Failed to refresh token: ${err.message}`);
      }

      // Calculate delay with exponential backoff (1s, 2s, 4s, etc.)
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      logger.debug({ attempt, delay }, "Retrying token refresh");
      await sleep(delay);
    }
  }

  return null;
}

// Configure Gmail OAuth2 client
export const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID_EMAIL,
  process.env.GOOGLE_CLIENT_SECRET_EMAIL,
  process.env.GOOGLE_REDIRECT_URI_EMAIL
);
