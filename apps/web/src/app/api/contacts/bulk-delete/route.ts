import { NextResponse } from "next/server";
import { prisma } from "@coldjot/database";
import { bulkDeleteContactsSchema } from "@coldjot/types/schemas";
import {
  requireAuth,
  isAuthError,
  findForeignContactIds,
} from "@/lib/auth/access";
import { parseBody } from "@/lib/http/validation";
import { logger } from "@/lib/logger";

/**
 * Bulk-delete contacts, soft or hard.
 *
 * Body: { contactIds: string[] (1..1000), mode?: "soft" | "hard" }
 *   - mode "soft" (default): set deletedAt = now() on each active contact.
 *     Children (analytics, sequences, threads) survive with their contactId
 *     intact. Reversible via POST /api/contacts/restore.
 *   - mode "hard": PURGE — delete the contact AND every child that references
 *     it (analytics, events, tracking, threads, enrollments, drafts). This is
 *     the destructive "Delete permanently" path; irreversible.
 *
 * IDOR guard: refuses (403) if ANY id is not owned by the caller. Note
 * findForeignContactIds does NOT filter deletedAt — a soft-deleted contact is
 * still owned, so the user may hard-purge their own trashed contacts.
 *
 * Size note: contactIds is capped at 1000 by the zod schema. For hard-purge of
 * large sets with deep analytics the transaction may hold locks for a while;
 * if this becomes a problem, move hard-purge to a background job (mailops
 * queue) and return 202. Out of scope for this plan.
 */
export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  const body = await parseBody(request, bulkDeleteContactsSchema);
  if (!body.ok) return body.response;
  const { contactIds, mode } = body.data;
  // mode defaults to "soft" via the zod schema (sub-plan 02).

  // IDOR guard — refuse if ANY id isn't owned by this user.
  const foreign = await findForeignContactIds(userId, contactIds);
  if (foreign.size > 0) {
    return NextResponse.json(
      { error: "Some contacts do not belong to this account" },
      { status: 403 }
    );
  }

  try {
    const result =
      mode === "hard"
        ? await purgeContacts(userId, contactIds)
        : await softDeleteContacts(userId, contactIds);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    logger.error("Error in bulk-delete contacts:", error);
    return NextResponse.json(
      { error: "Failed to delete contacts" },
      { status: 500 }
    );
  }
}

// ── Soft: set deletedAt = now() on active contacts. Children untouched. ──────
async function softDeleteContacts(userId: string, ids: string[]) {
  const result = await prisma.contact.updateMany({
    where: { id: { in: ids }, userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return { deleted: result.count, mode: "soft" as const };
}

// ── Hard (purge): delete the contact AND every child that references it. ─────
// Order matters because of `Restrict` FKs — SequenceContact + EmailThread MUST
// be deleted before the Contact row, or Postgres throws. Everything else is
// Cascade/SetNull and would auto-clean, but we delete them explicitly so the
// behavior is identical regardless of FK policy (defense in depth — the DB's
// actual rule may not match schema.prisma). Wrapped in a transaction so a
// failure rolls back all prior deletes (no half-purged state).
async function purgeContacts(userId: string, ids: string[]) {
  return await prisma.$transaction(async (tx) => {
    // 1. Restrict children FIRST (these block contact deletion if present).
    //    SequenceContact: un-enroll from all sequences.
    await tx.sequenceContact.deleteMany({
      where: { contactId: { in: ids } },
    });
    //    EmailThread: delete threads (and their messages cascade).
    await tx.emailThread.deleteMany({
      where: { contactId: { in: ids } },
    });

    // 2. SetNull children — delete explicitly so analytics are truly gone
    //    (hard-delete removes "everything including analytics").
    await tx.emailEvent.deleteMany({ where: { contactId: { in: ids } } });
    await tx.emailTracking.deleteMany({
      where: { contactId: { in: ids } },
    });
    await tx.sequenceStats.deleteMany({
      where: { contactId: { in: ids } },
    });

    // 3. Cascade child — would auto-delete, but explicit is clearer + safer.
    await tx.draft.deleteMany({ where: { contactId: { in: ids } } });

    // 4. Implicit M:N memberships (_EmailListContacts) are auto-removed by
    //    Prisma on contact delete — no explicit step needed.

    // 5. FINALLY delete the contacts themselves (no Restrict child remains).
    const result = await tx.contact.deleteMany({
      where: { id: { in: ids }, userId },
    });
    return { deleted: result.count, mode: "hard" as const };
  });
}
