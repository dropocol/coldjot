import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";

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

    console.log("sequenceId", sequenceId);
    console.log("stepId", stepId);

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
    delete json.sequenceId;
    delete json.type;

    // Prepare update data
    const updateData = { ...json };

    // If templateId is explicitly set to null (unlinking), remove it and keep content/subject
    if (json.templateId === null) {
      updateData.templateId = null;
    }

    // If templateId is provided, clear content and subject
    if (json.templateId) {
      updateData.content = null;
      updateData.subject = null;
    }

    console.log("Update Data", updateData);

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

    // Reset order of steps after deletion
    // TODO : this is not working
    // await prisma.sequenceStep.updateMany({
    //   where: { sequenceId: sequenceId },
    //   data: { order: { decrement: 1 } },
    // });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[SEQUENCE_STEP_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
