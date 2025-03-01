import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { queueApi } from "@/lib/queue/queue-api-client";
import { NextResponse } from "next/server";
import { SequenceStatus } from "@coldjot/types";
import { updateSequenceReadinessMetadata } from "@/lib/metadata-utils";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { testMode = false } = await req.json();
    const { id } = await params;

    // Get sequence and validate
    const sequence = await prisma.sequence.findUnique({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        steps: {
          orderBy: { order: "asc" },
        },
        contacts: {
          where: {
            // TODO: Update enum
            status: {
              notIn: ["completed", "opted_out"],
            },
          },
          include: {
            contact: true,
          },
        },
        businessHours: true,
        sequenceMailbox: true,
      },
    });

    if (!sequence) {
      return new NextResponse("Sequence not found", { status: 404 });
    }

    if (sequence.steps.length === 0) {
      return new NextResponse("Sequence has no steps", { status: 400 });
    }

    if (sequence.contacts.length === 0) {
      return new NextResponse("Sequence has no active contacts", {
        status: 400,
      });
    }

    // Update sequence status
    await prisma.sequence.update({
      where: { id },
      data: {
        status: SequenceStatus.ACTIVE,
        testMode,
      },
    });

    // Update metadata to reflect the new status
    await updateSequenceReadinessMetadata(id);

    // Launch the sequence using queue API
    const result = await queueApi.launchSequence(id, session.user.id, testMode);

    return NextResponse.json({
      success: true,
      jobId: result.jobId,
      contactCount: sequence.contacts.length,
      stepCount: sequence.steps.length,
    });
  } catch (error) {
    console.error("[SEQUENCE_LAUNCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
