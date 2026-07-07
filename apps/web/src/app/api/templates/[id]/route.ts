import { auth } from "@/auth";
import { requireAuth, isAuthError } from "@/lib/auth/access";
import { logger } from "@/lib/logger";
import { prisma } from "@coldjot/database";
import type { TemplateInUseError } from "@coldjot/types";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const template = await prisma.template.findFirst({
      where: {
        id: id,
        userId: session.user.id,
        deletedAt: null, // hide soft-deleted templates from the editor
      },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(template);
  } catch (error) {
    console.error("[TEMPLATE_GET]", error);
    return NextResponse.json(
      { error: "Failed to fetch template" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json();
  const { name, content, subject } = json;

  const template = await prisma.template.update({
    where: {
      id: id,
      userId: session.user.id,
    },
    data: {
      name,
      subject,
      content,
    },
  });

  return NextResponse.json(template);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  // Auth (modern pattern — replaces the old auth() call).
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  // IDOR + existence: scope by userId so foreign + missing both 404
  // (don't leak existence). Read name now for the 409 body in one query.
  const template = await prisma.template.findFirst({
    where: { id, userId },
    select: { id: true, name: true },
  });
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Active-use guard (sub-plan 01 engine). Runs identically for both soft
  // and hard mode — you cannot bypass it. Single delete is always soft.
  const usage = await prisma.sequence.findActiveTemplateUsage([id]);
  if (usage[id]?.blocked) {
    return NextResponse.json(
      {
        error: "Template is in use by an active or paused sequence",
        blocked: true,
        blockedTemplates: [
          { id, name: template.name, sequences: usage[id]!.sequences },
        ],
      } satisfies TemplateInUseError,
      { status: 409 }
    );
  }

  // Safe to soft-delete. Transaction keeps it atomic (matches the bulk route;
  // future-proofs against adding side effects like an audit row).
  try {
    await prisma.$transaction(async (tx) => {
      await tx.template.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error({ err: error, templateId: id }, "Error soft-deleting template");
    return NextResponse.json(
      { error: "Failed to delete template" },
      { status: 500 }
    );
  }
}
