import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";

interface ReorderStep {
  id: string;
  order: number;
  previousStepId: string | null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { steps } = (await req.json()) as { steps: ReorderStep[] };
    const { id } = await params;

    // Verify sequence ownership
    const sequence = await prisma.sequence.findUnique({
      where: {
        id: id,
        userId: session.user.id,
      },
    });

    if (!sequence) {
      return new NextResponse("Not found", { status: 404 });
    }

    // Update all steps in a transaction
    // TODO : check order + 1 if needed
    await prisma.$transaction(
      steps.map((step) =>
        prisma.sequenceStep.update({
          where: { id: step.id },
          data: {
            order: step.order + 1,
            previousStepId: step.previousStepId,
          },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[SEQUENCE_STEPS_REORDER]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
