import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";
import { updateSequenceReadinessMetadata } from "@/lib/metadata-utils";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { id } = await params;

    const sequence = await prisma.sequence.findUnique({
      where: {
        id: id,
        userId: session.user.id,
      },
      include: {
        steps: {
          orderBy: {
            order: "asc",
          },
        },
        businessHours: true,
        sequenceMailbox: true,
        _count: {
          select: {
            contacts: true,
          },
        },
      },
    });

    if (!sequence) {
      return new NextResponse("Sequence not found", { status: 404 });
    }

    // Only update metadata for draft sequences if it's missing or incomplete
    if (sequence && sequence.status === "draft") {
      // Cast metadata to an object with proper typing
      const metadataObj = (sequence.metadata as Record<string, any>) || {};
      const readiness = metadataObj.readiness || {};

      // Check if we need to update the metadata
      const needsUpdate =
        (!readiness.hasSteps && sequence.steps.length > 0) ||
        (!readiness.hasContacts && sequence._count.contacts > 0) ||
        (!readiness.hasBusinessHours && !!sequence.businessHours) ||
        (!readiness.hasMailbox && !!sequence.sequenceMailbox);

      if (needsUpdate) {
        // Use the centralized function to update metadata
        const updatedMetadata = await updateSequenceReadinessMetadata(id);

        // Update the sequence object to return
        if (updatedMetadata) {
          sequence.metadata = updatedMetadata;
        }
      }
    }

    return NextResponse.json(sequence);
  } catch (error) {
    console.error("[SEQUENCE_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { id } = await params;

    // Verify sequence ownership
    const sequence = await prisma.sequence.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!sequence) {
      return new NextResponse("Sequence not found", { status: 404 });
    }

    // Delete everything related to the sequence in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete sequence contacts and their events
      await tx.sequenceContact.deleteMany({
        where: { sequenceId: id },
      });

      // Delete sequence steps
      await tx.sequenceStep.deleteMany({
        where: { sequenceId: id },
      });

      // Delete business hours
      await tx.businessHours.deleteMany({
        where: { sequenceId: id },
      });

      await tx.emailThread.deleteMany({
        where: { sequenceId: id },
      });

      // Finally, delete the sequence itself
      await tx.sequence.delete({
        where: { id },
      });
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[SEQUENCE_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
