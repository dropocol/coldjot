/**
 * Adapter interface — abstracts the Gmail OAuth token-refresh path.
 *
 * Phase 7: `WatchService.getAccessToken` (and the send-email token-refresh
 * flow) reach `refreshTokenIfNeeded` from `lib/google/gmail/helper`, which
 * transitively hits the DB + Google's token endpoint. This interface is the
 * seam tests inject to avoid those external calls.
 */
import type { MailboxCredentials } from "@coldjot/types";
import { refreshTokenIfNeeded } from "@/lib/google/gmail/helper";

export interface TokenRefresher {
  /**
   * Return a valid access token for the given mailbox credentials, refreshing
   * when the current token is expired. Throws on refresh failure.
   */
  refreshIfNeeded(credentials: MailboxCredentials): Promise<string>;
}

/** Default impl — delegates to the lib/google/gmail/helper singleton. */
export class GmailTokenRefresher implements TokenRefresher {
  async refreshIfNeeded(credentials: MailboxCredentials): Promise<string> {
    return refreshTokenIfNeeded(credentials);
  }
}
