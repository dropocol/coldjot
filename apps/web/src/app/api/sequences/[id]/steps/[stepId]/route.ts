import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";

// Allowlist of fields a client may set on a step. Prevents mass-assignment —
// previously the raw JSON body was spread into prisma.update, letting a client
// overwrite arbitrary columns (order, sequenceId, etc.).
const STEP_WRITABLE_FIELDS = [
  "subject",
  "content",
  "body",
  "waitDays",
  "waitHours",
  "delayAmount",
  "delayUnit",
  "timing",
  "priority",
  "stepType",
  "includeSignature",
  "note",
  "replyToThread",
  "previousStepId",
  "templateId",
  "order",
] as const;

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

    const json = await req.json();

    // Build an allowlisted update payload. Only known fields are copied;
    // everything else (id, sequenceId, createdAt, etc.) is rejected.
    const updateData: Record<string, unknown> = {};
    for (const key of STEP_WRITABLE_FIELDS) {
      if (key in json) updateData[key] = json[key];
    }

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

// TODO : reset order of steps after a deletion

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
