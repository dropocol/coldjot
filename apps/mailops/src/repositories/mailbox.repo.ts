/**
 * Repository interface for the Mailbox model (+ the SequenceMailbox join table
 * that binds a Mailbox + optional EmailAlias to a Sequence).
 *
 * Call sites: lib/mailbox, lib/google/gmail/gmail, controllers/mailbox,
 * services/pubsub/handler, services/watch.
 */

export interface MailboxRecord {
  id: string;
  userId: string;
  email: string;
  isActive: boolean;
  provider: string;
  name: string | null;
  access_token: string | null;
  refresh_token: string | null;
  /** Epoch seconds (schema: `Int?`). Consumers multiply by 1000 for ms. */
  expires_at: number | null;
  providerAccountId: string;
}

export interface MailboxAliasRecord {
  id: string;
  alias: string;
  name: string | null;
}

export interface MailboxWithAliases extends MailboxRecord {
  aliases: MailboxAliasRecord[];
}

/** SequenceMailbox joined with its Mailbox + optional Alias. */
export interface SequenceMailboxRow {
  id: string;
  sequenceId: string;
  mailboxId: string;
  aliasId: string | null;
  userId: string;
  mailbox: MailboxRecord;
  alias: MailboxAliasRecord | null;
}

export interface MailboxRepository {
  /** Load mailbox by id+userId, with aliases. */
  findWithAliases(id: string, userId: string): Promise<MailboxWithAliases | null>;
  /** Load mailbox by id+userId (no aliases) — Gmail client construction. */
  findByIdForUser(id: string, userId: string): Promise<MailboxRecord | null>;
  /** Verify an active Gmail mailbox exists for a user+email. */
  findActiveGmail(userId: string, email: string): Promise<MailboxRecord | null>;
  /** Active Gmail mailbox by email alone (watch service — no userId on hand). */
  findActiveGmailByEmail(email: string): Promise<MailboxRecord | null>;
  /** Find any mailbox (active or not) by email, with aliases (pubsub routing). */
  findWithEmailAliases(email: string): Promise<MailboxWithAliases | null>;
  /** Persist refreshed access token + expiry (epoch ms → seconds). */
  updateTokens(id: string, accessToken: string, expiresAtMs: number): Promise<void>;

  // -- SequenceMailbox join table ------------------------------------------

  /** Just the mailboxId bound to a sequence (thread-watch lookup). */
  findSequenceMailboxId(sequenceId: string): Promise<string | null>;
  /** SequenceMailbox by its own id, with mailbox + alias joined. */
  findSequenceMailboxById(id: string): Promise<SequenceMailboxRow | null>;
  /** SequenceMailbox by sequenceMailboxId + sequenceId + userId (with joins). */
  findSequenceMailbox(
    sequenceMailboxId: string,
    sequenceId: string,
    userId: string
  ): Promise<SequenceMailboxRow | null>;
}
