import { NextResponse } from "next/server";
import { prisma } from "@coldjot/database";
import { bulkDeleteTemplatesSchema } from "@coldjot/types/schemas";
import {
  requireAuth,
  isAuthError,
  findForeignTemplateIds,
} from "@/lib/auth/access";
import { parseBody } from "@/lib/http/validation";
import { logger } from "@/lib/logger";

/**
 * Bulk hard-delete templates.
 *
 * Body: { templateIds: string[] (1..1000) }
 *
 * Templates have no soft-delete column (no `deletedAt`), so this is hard-delete
 * (purge) only — the rows are removed for real. No `mode` field.
 *
 * IDOR guard: refuses (403) if ANY id is not owned by the caller.
 *
 * FK reality: `Draft.templateId` is a `Restrict` FK — deleting a template that
 * is referenced by a Draft will make `deleteMany` throw at the DB level, which
 * surfaces as a 500 here. That is acceptable/intentional: the caller must
 * remove (or detach) the Draft first. `SequenceStep.templateId` and
 * `EmailRecord.templateId` are `SetNull`, so they auto-null out and never
 * block. Wrapped in a transaction so a Restrict failure rolls back cleanly.
 */
export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  const body = await parseBody(request, bulkDeleteTemplatesSchema);
  if (!body.ok) return body.response;
  const { templateIds } = body.data;

  // IDOR guard — refuse if ANY id isn't owned by this user.
  const foreign = await findForeignTemplateIds(userId, templateIds);
  if (foreign.size > 0) {
    return NextResponse.json(
      { error: "Some templates do not belong to this account" },
      { status: 403 }
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      return tx.template.deleteMany({
        where: { id: { in: templateIds }, userId },
      });
    });

    return NextResponse.json({ success: true, deleted: result.count });
  } catch (error) {
    logger.error("Error in bulk-delete templates:", error);
    return NextResponse.json(
      { error: "Failed to delete templates" },
      { status: 500 }
    );
  }
}
