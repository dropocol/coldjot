import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { SequenceContactStatusEnum } from "@coldjot/types";
import { updateSequenceReadinessField } from "@/lib/metadata-utils";
import { z } from "zod";

// Schema for validating the request body
const fromListSchema = z.object({
  listId: z.string().min(1, "List ID is required"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check if user is authenticated
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: true, message: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get sequence ID from params
    const { id: sequenceId } = await params;

    // Parse and validate request body
    const body = await request.json();
    const validation = fromListSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { message: "Invalid request body", errors: validation.error.format() },
        { status: 400 }
      );
    }

    const { listId } = validation.data;

    // Verify sequence ownership
    const sequence = await prisma.sequence.findUnique({
      where: {
        id: sequenceId,
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
      return NextResponse.json(
        { error: true, message: "Sequence not found" },
        { status: 404 }
      );
    }

    // Verify list ownership and get contacts
    const list = await prisma.emailList.findUnique({
      where: {
        id: listId,
        userId: session.user.id,
      },
      include: {
        contacts: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!list) {
      return NextResponse.json(
        { error: true, message: "List not found" },
        { status: 404 }
      );
    }

    if (list.contacts.length === 0) {
      return NextResponse.json(
        {
          error: true,
          message: "List has no contacts",
          added: 0,
          skipped: 0,
          total: 0,
        },
        { status: 400 }
      );
    }

    // Get contact IDs from the list
    const contactIds = list.contacts.map((contact) => contact.id);

    // Check which contacts are already in the sequence
    const existingContacts = await prisma.sequenceContact.findMany({
      where: {
        sequenceId,
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

    // Filter out contacts that are already in the sequence
    const newContactIds = contactIds.filter(
      (id) => !existingContactIds.has(id)
    );

    // If all contacts are already in the sequence, return early
    if (newContactIds.length === 0) {
      return NextResponse.json(
        {
          message: "All contacts from this list are already in the sequence",
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
      if (sequence._count.contacts === 0 && newContactIds.length > 0) {
        await updateSequenceReadinessField(sequenceId, "hasContacts", true);
      }

      return {
        added: newContactIds.length,
        skipped: existingContactIds.size,
        total: contactIds.length,
      };
    });

    return NextResponse.json({
      message: "Contacts from list added to sequence successfully",
      ...result,
    });
  } catch (error) {
    console.error("[SEQUENCE_CONTACTS_FROM_LIST]", error);
    return NextResponse.json(
      { error: true, message: "Internal Error" },
      { status: 500 }
    );
  }
}
