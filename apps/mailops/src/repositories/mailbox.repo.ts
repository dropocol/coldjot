/**
 * Repository interface for the Mailbox model.
 * Call sites: lib/mailbox, lib/google/gmail/gmail, routes/mailbox,
 * services/pubsub/handler, services/watch.
 */

export interface MailboxRecord {
  id: string;
  userId: string;
  email: string;
  isActive: boolean;
  provider: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: Date | null;
}

export interface MailboxWithAliases extends MailboxRecord {
  aliases: Array<{ id: string; email: string }>;
}

export interface MailboxRepository {
  /** Load mailbox by id+userId, with aliases. */
  findWithAliases(id: string, userId: string): Promise<MailboxWithAliases | null>;
  /** Load mailbox by id+userId (no aliases) — Gmail client construction. */
  findByIdForUser(id: string, userId: string): Promise<MailboxRecord | null>;
  /** Verify an active Gmail mailbox exists for a user+email. */
  findActiveGmail(userId: string, email: string): Promise<MailboxRecord | null>;
  /** Find any mailbox (active or not) by email, with aliases (pubsub routing). */
  findWithEmailAliases(email: string): Promise<MailboxWithAliases | null>;
  /** Persist refreshed access token + expiry. */
  updateTokens(id: string, accessToken: string, expiresAt: Date): Promise<void>;
}
