import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { SequenceContactStatusEnum } from "@coldjot/types";
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

    // Get the sequence with its steps
    const sequence = await prisma.sequence.findUnique({
      where: { id },
      include: {
        steps: {
          orderBy: {
            order: "asc",
          },
        },
      },
    });

    if (!sequence) {
      return new NextResponse("Sequence not found", { status: 404 });
    }

    const totalSteps = sequence.steps.length;

    // Get sequence contacts with their latest status and events
    const sequenceContacts = await prisma.sequenceContact.findMany({
      where: {
        sequenceId: id,
        sequence: {
          userId: session.user.id,
        },
      },
      include: {
        contact: {},
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    // Format contacts with their latest status and activity
    const enrichedContacts = sequenceContacts.map((contact) => {
      const currentStep = sequence.steps[contact.currentStep];
      // const latestEvent = latestEventsByContact.get(contact.contactId);

      // Determine status based on contact record and latest event
      let status: SequenceContactStatusEnum;

      if (contact.status === SequenceContactStatusEnum.REPLIED) {
        status = SequenceContactStatusEnum.REPLIED;
      } else if (contact.completed) {
        status = SequenceContactStatusEnum.COMPLETED;
        // } else if (latestEvent?.type.toLowerCase() === "bounced") {
      } else if (contact.status === SequenceContactStatusEnum.BOUNCED) {
        status = SequenceContactStatusEnum.FAILED;
      } else if (contact.currentStep > 0) {
        status = SequenceContactStatusEnum.IN_PROGRESS;
      } else {
        status = SequenceContactStatusEnum.NOT_STARTED;
      }

      return {
        ...contact,
        status,
      };
    });

    return NextResponse.json({
      contacts: enrichedContacts,
      totalSteps: sequence.steps.length,
    });
  } catch (error) {
    console.error("[SEQUENCE_CONTACTS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
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

    const { contactId } = await req.json();
    const { id } = await params;

    const sequence = await prisma.sequence.findUnique({
      where: {
        id: id,
        userId: session.user.id,
      },
    });

    if (!sequence) {
      return new NextResponse("Not found", { status: 404 });
    }

    const sequenceContact = await prisma.sequenceContact.create({
      data: {
        sequenceId: id,
        contactId,
        status: SequenceContactStatusEnum.NOT_STARTED,
        currentStep: 0,
      },
      include: {
        contact: {},
        sequence: {
          include: {
            steps: {
              orderBy: {
                order: "asc",
              },
            },
          },
        },
      },
    });

    // Return the contact with the same enriched format as GET
    const enrichedContact = {
      ...sequenceContact,
      status: SequenceContactStatusEnum.NOT_STARTED,
      currentStepName: sequenceContact.sequence.steps[0]?.subject || "Email",
      totalSteps: sequenceContact.sequence.steps.length,
      latestEvent: null,
    };

    return NextResponse.json(enrichedContact);
  } catch (error) {
    console.error("[SEQUENCE_CONTACTS_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
