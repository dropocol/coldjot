import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";
import { parseBody } from "@/lib/http/validation";
import { updateSequenceStepSchema } from "@coldjot/types/schemas";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { id: sequenceId, stepId } = await params;

    // Verify sequence ownership and existence
    const sequence = await prisma.sequence.findUnique({
      where: {
        id: sequenceId,
        userId: session.user.id,
      },
    });

    if (!sequence) {
      return new NextResponse("Sequence not found", { status: 404 });
    }

    // Verify step belongs to the sequence
    const existingStep = await prisma.sequenceStep.findUnique({
      where: {
        id: stepId,
        sequenceId: sequenceId,
      },
    });

    if (!existingStep) {
      return new NextResponse("Step not found", { status: 404 });
    }

    const body = await parseBody(req, updateSequenceStepSchema);
    if (!body.ok) return body.response;
    const json = body.data;

    // Build the update payload from the validated, allowlisted fields.
    // The schema's .strict() already rejects unknown keys (mass-assignment fix).
    const updateData: Record<string, unknown> = { ...json };

    // If templateId is explicitly set to null (unlinking), remove it and keep content/subject
    if (json.templateId === null) {
      updateData.templateId = null;
    }

    // If templateId is provided, clear content and subject so the template becomes the source of truth
    if (json.templateId) {
      updateData.content = null;
      updateData.subject = null;
    }

    // Update the step
    const step = await prisma.sequenceStep.update({
      where: {
        id: stepId,
        sequenceId: sequenceId,
      },
      data: updateData,
    });

    return NextResponse.json(step);
  } catch (error) {
    console.error("[SEQUENCE_STEP_UPDATE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { id: sequenceId, stepId } = await params;

    // Verify sequence ownership and existence
    const sequence = await prisma.sequence.findUnique({
      where: {
        id: sequenceId,
        userId: session.user.id,
      },
    });

    if (!sequence) {
      return new NextResponse("Sequence not found", { status: 404 });
    }

    // Verify and delete the step
    await prisma.sequenceStep.delete({
      where: {
        id: stepId,
        sequenceId: sequenceId, // Extra safety: ensure step belongs to sequence
      },
    });

    // Renumber remaining steps so `order` stays gapless (1, 2, 3, ...).
    // Previously this was a TODO that left gaps (1, 3, 4) after a deletion.
    const remainingSteps = await prisma.sequenceStep.findMany({
      where: { sequenceId },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    await prisma.$transaction(
      remainingSteps.map((step, index) =>
        prisma.sequenceStep.update({
          where: { id: step.id },
          data: { order: index },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[SEQUENCE_STEP_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
