import { NextResponse } from "next/server";
import { prisma } from "@coldjot/database";
import { bulkDeleteSequencesSchema } from "@coldjot/types/schemas";
import {
  requireAuth,
  isAuthError,
  findForeignSequenceIds,
} from "@/lib/auth/access";
import { parseBody } from "@/lib/http/validation";
import { logger } from "@/lib/logger";

/**
 * Bulk (hard-)delete sequences.
 *
 * Body: { sequenceIds: string[] (1..1000) }
 *
 * Sequences have no soft-delete column (only contacts do), so this is a
 * hard-delete only — there is no `mode` field and no soft path. The route
 * deletes each sequence AND every child that references it. Mirrors the single
 * DELETE /api/sequences/[id] cleanup but with `sequenceId: { in: ids }` and a
 * single shared transaction.
 *
 * IDOR guard: refuses (403) if ANY id is not owned by the caller.
 *
 * Size note: sequenceIds is capped at 1000 by the zod schema. For very large
 * sets the transaction may hold locks for a while; if this becomes a problem,
 * move to a background job (mailops queue) and return 202. Out of scope here.
 */
export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  const body = await parseBody(request, bulkDeleteSequencesSchema);
  if (!body.ok) return body.response;
  const { sequenceIds } = body.data;

  // IDOR guard — refuse if ANY id isn't owned by this user.
  const foreign = await findForeignSequenceIds(userId, sequenceIds);
  if (foreign.size > 0) {
    return NextResponse.json(
      { error: "Some sequences do not belong to this account" },
      { status: 403 }
    );
  }

  try {
    const result = await purgeSequences(userId, sequenceIds);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    logger.error("Error in bulk-delete sequences:", error);
    return NextResponse.json(
      { error: "Failed to delete sequences" },
      { status: 500 }
    );
  }
}

// ── Purge: delete the sequences AND every child that references them. ────────
// Order mirrors DELETE /api/sequences/[id]: SequenceContact + SequenceStep +
// BusinessHours + EmailThread are removed before the Sequence row itself
// (defense in depth — explicit deletes make behavior identical regardless of
// the DB's FK policy). Wrapped in a transaction so a failure rolls back all
// prior deletes (no half-purged state).
async function purgeSequences(userId: string, ids: string[]) {
  return await prisma.$transaction(async (tx) => {
    // 1. Sequence contacts (un-enroll contacts from these sequences).
    await tx.sequenceContact.deleteMany({
      where: { sequenceId: { in: ids } },
    });

    // 2. Sequence steps.
    await tx.sequenceStep.deleteMany({
      where: { sequenceId: { in: ids } },
    });

    // 3. Business hours.
    await tx.businessHours.deleteMany({
      where: { sequenceId: { in: ids } },
    });

    // 4. Email threads (their messages cascade).
    await tx.emailThread.deleteMany({
      where: { sequenceId: { in: ids } },
    });

    // 5. FINALLY delete the sequences themselves (no child remains).
    const result = await tx.sequence.deleteMany({
      where: { id: { in: ids }, userId },
    });
    return { deleted: result.count };
  });
}
