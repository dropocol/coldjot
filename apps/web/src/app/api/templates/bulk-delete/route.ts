import { NextResponse } from "next/server";
import { prisma } from "@coldjot/database";
import { bulkDeleteTemplatesSchema } from "@coldjot/types/schemas";
import type {
  BulkDeleteTemplatesResult,
  BlockedTemplate,
  TemplateInUseError,
} from "@coldjot/types";
import {
  requireAuth,
  isAuthError,
  findForeignTemplateIds,
} from "@/lib/auth/access";
import { parseBody } from "@/lib/http/validation";
import { logger } from "@/lib/logger";

/**
 * Bulk delete templates. Soft-delete by default (sets deletedAt); hard-purge
 * only when `mode: "hard"`.
 *
 * Body: { templateIds: string[] (1..1000), mode?: "soft" | "hard" }
 *
 * Active-use guard: a template referenced by a step in an ACTIVE or PAUSED
 * sequence is NEVER deletable (409), regardless of mode. You cannot bypass the
 * guard by switching to hard mode — it runs identically for both. Trashed
 * templates still resolve at send time (trash state hides from the editor; it
 * does not blank future sends). See plans/template-delete-guards/README.md.
 *
 * IDOR guard: refuses (403) if ANY id is not owned by the caller. Note
 * `findForeignTemplateIds` deliberately ignores trash state — a trashed
 * template is still owned.
 *
 * Partial success is allowed: if 3 of 5 ids are blocked, the 2 deletable ones
 * are (soft|hard)-deleted and the response carries `blocked: 3` + the 3
 * blocked entries. If EVERY id is blocked → 409 with the full list.
 */
export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  const body = await parseBody(request, bulkDeleteTemplatesSchema);
  if (!body.ok) return body.response;
  const { templateIds, mode } = body.data;

  // IDOR guard — refuse if ANY id isn't owned by this user.
  const foreign = await findForeignTemplateIds(userId, templateIds);
  if (foreign.size > 0) {
    return NextResponse.json(
      { error: "Some templates do not belong to this account" },
      { status: 403 }
    );
  }

  // Active-use guard — runs BEFORE the transaction, reads committed state.
  // The transaction only wraps the write; holding it open across the separate
  // read query is unnecessary. The gap between guard and write is acceptable
  // (sequence status changes on the order of seconds/minutes).
  const usage = await prisma.sequence.findActiveTemplateUsage(templateIds);
  const blockedTemplates: BlockedTemplate[] = [];
  const deletableIds: string[] = [];
  for (const id of templateIds) {
    if (usage[id]?.blocked) {
      blockedTemplates.push({
        id,
        name: "", // hydrated below from one fetch
        sequences: usage[id]!.sequences,
      });
    } else {
      deletableIds.push(id);
    }
  }

  // Hydrate blocked template names (the guard returns sequence meta, not the
  // template's own name).
  if (blockedTemplates.length > 0) {
    const names = await prisma.template.findMany({
      where: { id: { in: blockedTemplates.map((b) => b.id) } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(names.map((n) => [n.id, n.name]));
    for (const b of blockedTemplates) b.name = nameMap.get(b.id) ?? "";
  }

  // If EVERY requested id is blocked → 409 with the full list (nothing deleted).
  if (deletableIds.length === 0) {
    return NextResponse.json(
      {
        error: "All selected templates are in active use",
        blocked: true,
        blockedTemplates,
      } satisfies TemplateInUseError,
      { status: 409 }
    );
  }

  try {
    const deleted = await prisma.$transaction(async (tx) => {
      if (mode === "hard") {
        const r = await tx.template.deleteMany({
          where: { id: { in: deletableIds }, userId },
        });
        return r.count;
      }
      // Soft mode (default). `deletedAt: null` prevents double-deletion —
      // re-soft-deleting an already-trashed row is a no-op that wouldn't
      // count toward `deleted`.
      const r = await tx.template.updateMany({
        where: { id: { in: deletableIds }, userId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      return r.count;
    });

    const result: BulkDeleteTemplatesResult = {
      deleted,
      mode,
      blocked: blockedTemplates.length,
      blockedTemplates,
    };
    return NextResponse.json(result);
  } catch (error) {
    logger.error("Error in bulk-delete templates:", error);
    return NextResponse.json(
      { error: "Failed to delete templates" },
      { status: 500 }
    );
  }
}
