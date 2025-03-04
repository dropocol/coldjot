import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";

// Sync contacts from a list to a sequence
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; listId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { id, listId } = await params;

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

    // Verify list ownership
    const list = await prisma.emailList.findFirst({
      where: {
        id: listId,
        userId: session.user.id,
      },
      include: {
        contacts: true,
      },
    });

    if (!list) {
      return new NextResponse("List not found", { status: 404 });
    }

    // Check if list is attached to sequence
    const existingConnection = await prisma.sequence.findFirst({
      where: {
        id,
        lists: {
          some: {
            id: listId,
          },
        },
      },
    });

    if (!existingConnection) {
      return new NextResponse("List not attached to sequence", {
        status: 400,
      });
    }

    // Get existing sequence contacts
    const existingContacts = await prisma.sequenceContact.findMany({
      where: {
        sequenceId: id,
      },
      select: {
        contactId: true,
      },
    });

    const existingContactIds = existingContacts.map(
      (contact) => contact.contactId
    );

    // Filter out contacts that are already in the sequence
    const newContacts = list.contacts.filter(
      (contact) => !existingContactIds.includes(contact.id)
    );

    if (newContacts.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No new contacts to add",
        added: 0,
      });
    }

    // Add new contacts to the sequence
    await prisma.sequenceContact.createMany({
      data: newContacts.map((contact) => ({
        sequenceId: id,
        contactId: contact.id,
        status: "not_sent",
        currentStep: 0,
      })),
      skipDuplicates: true,
    });

    // Create a sync record that mailops can watch
    await prisma.listSyncRecord.create({
      data: {
        listId,
        sequenceId: id,
        status: "completed",
        contactsAdded: newContacts.length,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Added ${newContacts.length} contacts to sequence`,
      added: newContacts.length,
    });
  } catch (error) {
    console.error("[SEQUENCE_LIST_SYNC]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
