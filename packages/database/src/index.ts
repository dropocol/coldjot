import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encrypt, decrypt, isEncrypted } from "./crypto";
import { domainExtension } from "./domain-extension";

/**
 * OAuth token fields stored at rest, encrypted. These exist on both the
 * `Mailbox` and `Account` (NextAuth) models.
 */
const TOKEN_FIELDS = ["access_token", "refresh_token", "id_token"] as const;

/** Encrypt token fields on a write payload (create/update/upsert data). */
function encryptTokenFields(data: unknown): void {
  if (!data || typeof data !== "object") return;
  const record = data as Record<string, unknown>;
  for (const field of TOKEN_FIELDS) {
    const value = record[field];
    // Only encrypt strings; skip already-encrypted values (idempotent) and
    // non-string values (e.g. Prisma's atomic increment ops, undefined).
    if (typeof value === "string" && !isEncrypted(value)) {
      record[field] = encrypt(value);
    }
    // null/undefined pass through (nullable columns).
  }
}

// Per-model read decoders. Written explicitly (not Object.fromEntries) so the
// Prisma extension's strict types can verify each field's `needs`/`compute`.
const decryptOnRead = {
  access_token: {
    needs: { access_token: true },
    compute(row: Record<string, unknown>) {
      return decrypt(row.access_token as string | null | undefined);
    },
  },
  refresh_token: {
    needs: { refresh_token: true },
    compute(row: Record<string, unknown>) {
      return decrypt(row.refresh_token as string | null | undefined);
    },
  },
  id_token: {
    needs: { id_token: true },
    compute(row: Record<string, unknown>) {
      return decrypt(row.id_token as string | null | undefined);
    },
  },
} as const;

/** Write-side hooks: encrypt token fields on create/update/upsert/createMany. */
const encryptOnWrite = {
  async create({ args, query }: { args: { data: unknown }; query: (a: unknown) => unknown }) {
    encryptTokenFields(args.data);
    return query(args);
  },
  async createMany({ args, query }: { args: { data: unknown | unknown[] }; query: (a: unknown) => unknown }) {
    if (Array.isArray(args.data)) args.data.forEach(encryptTokenFields);
    else encryptTokenFields(args.data);
    return query(args);
  },
  async update({ args, query }: { args: { data: unknown }; query: (a: unknown) => unknown }) {
    encryptTokenFields(args.data);
    return query(args);
  },
  async upsert({ args, query }: { args: { create: unknown; update: unknown }; query: (a: unknown) => unknown }) {
    encryptTokenFields(args.create);
    encryptTokenFields(args.update);
    return query(args);
  },
} as const;

/**
 * Prisma 7 moved to a driver-adapter model: the connection URL no longer
 * lives in schema.prisma. Instead we pass an adapter (PrismaPg) constructed
 * from the DATABASE_URL to the PrismaClient constructor.
 *
 * The `$extends` below transparently encrypts OAuth token fields on write and
 * decrypts them on read for the `mailbox` and `account` models, so all
 * consumers (web + mailops) get the behavior automatically without changing
 * call sites.
 */
function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  // SECURITY: Prisma "query" logging emits every SQL statement WITH bound
  // parameters, which would write OAuth tokens (access_token / refresh_token)
  // to stdout/logs. We therefore NEVER enable ["query"] in production, and
  // gate it behind an explicit LOG_SQL flag elsewhere (default off).
  const enableSqlLog =
    process.env.NODE_ENV !== "production" && process.env.LOG_SQL === "true";

  const base = new PrismaClient({
    adapter,
    log: enableSqlLog ? ["query", "error", "warn"] : ["error", "warn"],
  });

  return base
    .$extends({
      name: "tokenEncryption",
      result: {
        mailbox: { ...decryptOnRead },
        account: { ...decryptOnRead },
      },
      query: {
        mailbox: { ...encryptOnWrite },
        account: { ...encryptOnWrite },
      },
    })
    .$extends(domainExtension);
}

// The extended client has a distinct type from the bare PrismaClient. Cache it
// on globalThis to avoid spawning one client per hot-reload in dev.
//
// `Db` is the public type consumers inject when they want Prisma-direct access
// (mailops v2). It captures the $extends above (token encryption), so callers
// get the extension's type — never use bare `new PrismaClient()` for DB work.
export type Db = ReturnType<typeof createPrismaClient>;
declare global {
  // eslint-disable-next-line no-var
  var __prismaExtended: Db | undefined;
}

export const prisma: Db =
  globalThis.__prismaExtended ?? createPrismaClient();

if (process.env.NODE_ENV !== "production")
  globalThis.__prismaExtended = prisma;

// Re-export all Prisma types + the field crypto helpers (for backfill scripts).
export * from "@prisma/client";
export { encrypt, decrypt, isEncrypted } from "./crypto";

