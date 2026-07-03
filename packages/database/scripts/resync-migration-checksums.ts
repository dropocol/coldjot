/**
 * One-off: resync the `_prisma_migrations` checksum table to match the
 * migration files currently on disk.
 *
 * Context: `prisma migrate dev` refuses to run when a migration file's
 * stored checksum (in the `_prisma_migrations` table) doesn't match its
 * current on-disk bytes — error P3017 ("modified after it was applied").
 * This commonly happens after a `git filter-repo` rewrite or a line-ending
 * normalization that touches file bytes without changing SQL semantics.
 *
 * This script recomputes the SHA-256 of every `migration.sql` on disk and
 * updates any stale `checksum` rows in `_prisma_migrations`. It does NOT touch
 * your data tables or the schema — only the bookkeeping table Prisma uses to
 * decide what to apply next. After running it, `prisma migrate dev` will detect
 * genuinely-pending migrations (e.g. plan 10's) and apply them.
 *
 * Run with Node, against the target environment's DATABASE_URL:
 *   DATABASE_URL=postgresql://... node --import tsx packages/database/scripts/resync-migration-checksums.ts
 *
 * Safety:
 * - DRY_RUN=1 (default) prints every stale row it would update, without writing.
 *   Re-run with DRY_RUN=0 to apply.
 * - Only updates the `checksum` column; never inserts/deletes migration rows.
 *   (New pending migrations are left for `prisma migrate dev` to record itself.)
 */
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DRY_RUN = process.env.DRY_RUN !== "0";
const MIGRATIONS_DIR =
  process.env.MIGRATIONS_DIR ?? join(import.meta.dirname, "..", "prisma", "migrations");

/**
 * Prisma 7 moved to a driver-adapter model — the connection URL no longer lives
 * in schema.prisma, so a bare `new PrismaClient()` won't initialize. We build
 * the PrismaPg adapter from DATABASE_URL the same way packages/database/src does.
 * No $extends here: we only touch _prisma_migrations, not token fields.
 */
function createClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set (e.g. via `dotenv -e env/.env.development --`).");
  }
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter, log: ["error", "warn"] });
}

/**
 * Prisma's checksum is the SHA-256 hex digest of the migration's `migration.sql`
 * file contents (UTF-8). This matches what `@prisma/migrate` records on first
 * apply. We compute over raw file bytes so any byte-level change (line endings,
 * trailing whitespace) is reflected.
 */
async function checksumFor(dir: string): Promise<string> {
  const sql = await readFile(join(dir, "migration.sql"), "utf8");
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

async function main() {
  const prisma = createClient();

  try {
    // Map of migration folder name -> computed checksum.
    const dirs = (await readdir(MIGRATIONS_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    const onDisk = new Map<string, string>();
    for (const name of dirs) {
      onDisk.set(name, await checksumFor(join(MIGRATIONS_DIR, name)));
    }

    // Existing rows in _prisma_migrations.
    const rows = await prisma.$queryRaw<
      Array<{ id: string; migration_name: string; checksum: string }>
    >`SELECT id, migration_name, checksum FROM "_prisma_migrations"`;

    const stale: Array<{ id: string; name: string; old: string; next: string }> = [];
    const missingFromDisk: string[] = []; // applied in DB but no folder on disk
    let matched = 0;

    for (const row of rows) {
      const next = onDisk.get(row.migration_name);
      if (next === undefined) {
        missingFromDisk.push(row.migration_name);
        continue;
      }
      if (next !== row.checksum) {
        stale.push({
          id: row.id,
          name: row.migration_name,
          old: row.checksum,
          next,
        });
      } else {
        matched++;
      }
    }

    console.log(`Migrations on disk:       ${onDisk.size}`);
    console.log(`Migrations recorded in DB: ${rows.length}`);
    console.log(`Checksums already correct: ${matched}`);
    console.log(`Checksums to resync:      ${stale.length}`);
    if (missingFromDisk.length) {
      console.log(`⚠️  Applied in DB but no folder on disk (${missingFromDisk.length}):`);
      for (const n of missingFromDisk) console.log(`   - ${n}`);
    }

    if (stale.length === 0) {
      console.log("\nNothing to update. Drift must be elsewhere (or already resolved).");
      return;
    }

    console.log(`\nMode: ${DRY_RUN ? "DRY_RUN (no writes)" : "APPLY (will update checksums)"}`);
    console.log("Stale migrations:");
    for (const s of stale) {
      console.log(`   - ${s.name}`);
      console.log(`       old: ${s.old}`);
      console.log(`       new: ${s.next}`);
    }

    if (DRY_RUN) {
      console.log("\nRe-run with DRY_RUN=0 to apply the new checksums.");
      return;
    }

    // Update each stale row's checksum. One statement per row keeps the WHERE
    // clause unambiguous (migration_name is unique in this table).
    let updated = 0;
    for (const s of stale) {
      const res = await prisma.$executeRaw`
        UPDATE "_prisma_migrations"
        SET checksum = ${s.next}
        WHERE id = ${s.id}
      `;
      updated += res;
    }
    console.log(`\nDone. Updated ${updated} checksum row(s).`);
    console.log("Next: run `npx prisma migrate dev` — it should now only apply pending migrations.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Resync failed:", err);
  process.exit(1);
});
