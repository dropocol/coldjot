import { sleep } from "@/utils";
import { google } from "googleapis";
import { TokenRefreshError } from "@coldjot/types";
import { getSenderMailbox, updateMailboxCredentials } from "@/lib/mailbox";
import { JOB_RETRY } from "@/config/queue/policy";

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

      console.log(`🔄 Token refreshed successfully on attempt ${attempt + 1}`);

      // Save the new access token
      console.log(`🔄 Finding mailbox for user ${userId}`);
      const mailbox = await getSenderMailbox(userId, mailboxId);

      console.log(`🔄 Updating mailbox ${mailbox?.id} with new access token`);
      await updateMailboxCredentials(mailboxId, {
        accessToken: credentials.access_token,
        expiryDate: credentials.expiry_date!,
      });

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


// Configure Gmail OAuth2 client
export const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID_EMAIL,
  process.env.GOOGLE_CLIENT_SECRET_EMAIL,
  process.env.GOOGLE_REDIRECT_URI_EMAIL
);
