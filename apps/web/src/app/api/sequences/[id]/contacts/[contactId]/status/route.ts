import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";
import { SequenceContactStatusEnum } from "@coldjot/types";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { id, contactId } = await params;
    const { status } = await req.json();

    // Validate status
    if (!Object.values(SequenceContactStatusEnum).includes(status)) {
      return new NextResponse("Invalid status", { status: 400 });
    }

    // Verify sequence ownership and get sequence contact
    const sequenceContact = await prisma.sequenceContact.findFirst({
      where: {
        id: contactId,
        sequenceId: id,
        sequence: {
          userId: session.user.id,
        },
      },
    });

    if (!sequenceContact) {
      return new NextResponse("Sequence contact not found", { status: 404 });
    }

    // Update the status and set completed if needed
    const updatedContact = await prisma.sequenceContact.update({
      where: { id: contactId },
      data: {
        status,
        completed: true,
        completedAt:
          status === SequenceContactStatusEnum.COMPLETED ? new Date() : null,
        updatedAt: new Date(),
        nextScheduledAt: null,
      },
      include: {
        contact: true,
      },
    });

    return NextResponse.json(updatedContact);
  } catch (error) {
    console.error("[SEQUENCE_CONTACT_STATUS_UPDATE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
