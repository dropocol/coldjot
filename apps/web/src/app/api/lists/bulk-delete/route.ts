import { NextResponse } from "next/server";
import { prisma } from "@coldjot/database";
import { bulkDeleteListsSchema } from "@coldjot/types/schemas";
import {
  requireAuth,
  isAuthError,
  findForeignListIds,
} from "@/lib/auth/access";
import { parseBody } from "@/lib/http/validation";
import { logger } from "@/lib/logger";

/**
 * Bulk-delete email lists (HARD-DELETE only).
 *
 * Body: { listIds: string[] (1..1000) }
 *
 * Lists have no soft-delete/tombstone column, so — unlike contacts — there is
 * no mode/trash distinction: this always PURGES. The implicit M:N join
 * (`_EmailListContacts`) auto-cascades on list delete, so no manual child
 * cleanup is needed. Wrapped in a transaction anyway so the IDOR check and the
 * delete are atomic (no window where ownership is re-checked against a
 * half-applied state).
 *
 * IDOR guard: refuses (403) if ANY id is not owned by the caller.
 *
 * `listIds` is capped at 1000 by the zod schema to keep the request bounded.
 */
export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  const body = await parseBody(request, bulkDeleteListsSchema);
  if (!body.ok) return body.response;
  const { listIds } = body.data;

  // IDOR guard — refuse if ANY id isn't owned by this user.
  const foreign = await findForeignListIds(userId, listIds);
  if (foreign.size > 0) {
    return NextResponse.json(
      { error: "Some lists do not belong to this account" },
      { status: 403 }
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      return tx.emailList.deleteMany({
        where: { id: { in: listIds }, userId },
      });
    });

    return NextResponse.json({ success: true, deleted: result.count });
  } catch (error) {
    logger.error("Error in bulk-delete lists:", error);
    return NextResponse.json(
      { error: "Failed to delete lists" },
      { status: 500 }
    );
  }
}
