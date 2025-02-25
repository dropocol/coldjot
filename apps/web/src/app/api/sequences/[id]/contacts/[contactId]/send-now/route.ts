import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";

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

    // Update the nextScheduledAt to current time
    const updatedContact = await prisma.sequenceContact.update({
      where: { id: contactId },
      data: {
        nextScheduledAt: new Date(),
      },
      include: {
        contact: true,
      },
    });

    return NextResponse.json(updatedContact);
  } catch (error) {
    console.error("[SEQUENCE_CONTACT_SEND_NOW]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
