import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { z } from "zod";
import { SequenceContactStatusEnum } from "@coldjot/types";
import { updateSequenceReadinessField } from "@/lib/metadata-utils";

// Schema for validating the request body
const bulkAddContactsSchema = z.object({
  contactIds: z.array(z.string()).min(1, "At least one contact ID is required"),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Check if user is authenticated
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Get sequence ID from params
    const sequenceId = params.id;

    // Parse and validate request body
    const body = await request.json();
    const validation = bulkAddContactsSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { message: "Invalid request body", errors: validation.error.format() },
        { status: 400 }
      );
    }

    const { contactIds } = validation.data;

    // Get the sequence
    const sequence = await prisma.sequence.findUnique({
      where: {
        id: sequenceId,
        userId: session.user.id,
      },
      include: {
        contacts: {
          select: {
            contactId: true,
          },
        },
      },
    });

    if (!sequence) {
      return new NextResponse("Sequence not found", { status: 404 });
    }

    // Check which contacts are already in the sequence
    const existingContactIds = sequence.contacts.map(
      (contact) => contact.contactId
    );

    // Filter out contacts that are already in the sequence
    const newContactIds = contactIds.filter(
      (id) => !existingContactIds.includes(id)
    );

    // If all contacts are already in the sequence, return early
    if (newContactIds.length === 0) {
      return NextResponse.json(
        {
          message: "All contacts are already in the sequence",
          added: 0,
          skipped: contactIds.length,
          total: contactIds.length,
        },
        { status: 409 }
      );
    }

    // Add contacts to the sequence in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create sequence contacts
      await tx.sequenceContact.createMany({
        data: newContactIds.map((contactId) => ({
          sequenceId,
          contactId,
          status: SequenceContactStatusEnum.NOT_STARTED,
          currentStep: 0,
        })),
      });

      // If this is the first contact being added, update the sequence's hasContacts field
      if (sequence.contacts.length === 0 && newContactIds.length > 0) {
        await updateSequenceReadinessField(sequenceId, "hasContacts", true);
      }

      return {
        added: newContactIds.length,
        skipped: contactIds.length - newContactIds.length,
        total: contactIds.length,
      };
    });

    return NextResponse.json({
      message: "Contacts added to sequence successfully",
      ...result,
    });
  } catch (error) {
    console.error("Error adding contacts to sequence:", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
