import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { SequenceContactStatusEnum } from "@coldjot/types";
import { NextResponse } from "next/server";
import { updateSequenceReadinessField } from "@/lib/metadata-utils";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { contactIds } = await req.json();
    const { id } = await params;

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return NextResponse.json(
        { error: true, message: "No contact IDs provided" },
        { status: 400 }
      );
    }

    const sequence = await prisma.sequence.findUnique({
      where: {
        id: id,
        userId: session.user.id,
      },
      select: {
        id: true,
        metadata: true,
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

    // Check which contacts are already in the sequence
    const existingContacts = await prisma.sequenceContact.findMany({
      where: {
        sequenceId: id,
        contactId: {
          in: contactIds,
        },
      },
      select: {
        contactId: true,
      },
    });

    const existingContactIds = new Set(
      existingContacts.map((c) => c.contactId)
    );
    const newContactIds = contactIds.filter(
      (id) => !existingContactIds.has(id)
    );

    if (newContactIds.length === 0) {
      return NextResponse.json(
        { error: true, message: "All contacts are already in the sequence" },
        { status: 409 }
      );
    }

    // Add new contacts to the sequence
    const sequenceContacts = await prisma.$transaction(
      newContactIds.map((contactId) =>
        prisma.sequenceContact.create({
          data: {
            sequenceId: id,
            contactId,
            status: SequenceContactStatusEnum.NOT_STARTED,
            currentStep: 0,
          },
        })
      )
    );

    // Update the sequence metadata if this is the first contact
    const metadataObj = (sequence.metadata as Record<string, any>) || {};
    const readiness = metadataObj.readiness || {};

    if (sequence._count.contacts === 0 || !readiness.hasContacts) {
      await updateSequenceReadinessField(id, "hasContacts", true);
    }

    return NextResponse.json({
      success: true,
      added: sequenceContacts.length,
      skipped: existingContactIds.size,
      total: contactIds.length,
    });
  } catch (error) {
    console.error("[SEQUENCE_CONTACTS_BULK_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
