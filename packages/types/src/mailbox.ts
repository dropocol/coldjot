export interface Mailbox {
  id?: string;
  name?: string;
  userId?: string;
  email?: string;
  providerAccountId?: string;
  accessToken?: string;
  refreshToken?: string;
  expiryDate?: number;
  aliases?: EmailAlias[];
  defaultAliasId?: string;
}

export interface EmailAlias {
  id: string;
  alias: string;
  name?: string | null;
  isActive: boolean;
}

export interface SequenceMailbox {
  id: string;
  mailboxId: string;
  aliasId: string | null;
}

/** Mailbox shape including aliases, as used by UI consumers. */
export interface MailboxWithAliases extends Mailbox {
  id: string;
  email: string;
  aliases: EmailAlias[];
}

export interface TokenRefreshError extends Error {
  code?: string;
  status?: number;
}

// ─── Repository record shapes (concrete DB columns) ─────────────────────────
// These mirror the concrete-column row shapes consumed by the mailops
// repository layer. They are intentionally distinct from the all-optional
// DTOs above (e.g. `Mailbox` / `MailboxWithAliases`).

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

/**
 * DAO shape: MailboxRecord + its aliases. Renamed from `MailboxWithAliases`
 * to avoid colliding with the web-facing `MailboxWithAliases` above — that
 * one extends the all-optional `Mailbox` DTO; this one extends the
 * concrete-column `MailboxRecord`.
 */
export interface MailboxWithAliasesRecord extends MailboxRecord {
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
