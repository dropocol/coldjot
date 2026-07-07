import { NextResponse } from "next/server";
import { prisma } from "@coldjot/database";
import { restoreContactsSchema } from "@coldjot/types/schemas";
import {
  requireAuth,
  isAuthError,
  findForeignContactIds,
} from "@/lib/auth/access";
import { parseBody } from "@/lib/http/validation";
import { logger } from "@/lib/logger";

/**
 * Restore previously soft-deleted contacts (flip deletedAt back to null).
 *
 * Body: { contactIds: string[] } (1..1000 ids, validated by zod).
 *
 * IDOR guard: refuses if ANY id is not owned by the caller (403). Note that
 * findForeignContactIds deliberately does NOT filter deletedAt — a soft-deleted
 * contact is still owned, so the user may restore their own trashed contacts.
 * The `deletedAt: { not: null }` predicate on the updateMany ensures we only
 * flip actually-trashed rows (restoring an already-active contact is a no-op
 * that does not count toward the response).
 */
export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  const body = await parseBody(request, restoreContactsSchema);
  if (!body.ok) return body.response;
  const { contactIds } = body.data;

  // IDOR guard: refuse if any id isn't owned by this user.
  const foreign = await findForeignContactIds(userId, contactIds);
  if (foreign.size > 0) {
    return NextResponse.json(
      { error: "Some contacts do not belong to this account" },
      { status: 403 }
    );
  }

  try {
    const result = await prisma.contact.updateMany({
      where: {
        id: { in: contactIds },
        userId,
        deletedAt: { not: null },
      },
      data: { deletedAt: null },
    });
    return NextResponse.json({ success: true, restored: result.count });
  } catch (error) {
    logger.error("Error restoring contacts:", error);
    return NextResponse.json(
      { error: "Failed to restore contacts" },
      { status: 500 }
    );
  }
}
