import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";

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
