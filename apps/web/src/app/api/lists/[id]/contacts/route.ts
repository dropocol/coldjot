import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";

// Helper function to trigger list sync via mailops
async function triggerListSync(listId: string) {
  try {
    // Find all sequences that have this list
    const sequences = await prisma.sequence.findMany({
      where: {
        lists: {
          some: {
            id: listId,
          },
        },
      },
      select: {
        id: true,
      },
    });

    // Call mailops sync endpoint for each sequence
    await Promise.all(
      sequences.map(async (sequence) => {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_MAILOPS_API_URL}/lists/${listId}/sync`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sequenceId: sequence.id,
            }),
          }
        );

        if (!response.ok) {
          throw new Error(
            `Failed to sync list ${listId} with sequence ${sequence.id}`
          );
        }

        return response.json();
      })
    );

    return true;
  } catch (error) {
    console.error("Failed to trigger list sync:", error);
    return false;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { contactId } = await request.json();

    // Verify list ownership
    const list = await prisma.emailList.findUnique({
      where: {
        id: id,
        userId: session.user.id,
      },
      include: {
        contacts: {
          where: {
            id: contactId,
          },
          select: {
            id: true,
          },
        },
      },
    });

    if (!list) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    // Check if contact is already in the list
    if (list.contacts.length > 0) {
      console.log(`Contact ${contactId} is already in list ${id}`);
      return NextResponse.json(
        {
          message: "Contact is already in the list",
          alreadyInList: true,
          list: {
            id: list.id,
            name: list.name,
            _count: {
              contacts: list.contacts.length,
            },
          },
        },
        { status: 409 }
      ); // Use 409 Conflict for already existing resources
    }

    // Add contact to list
    const updatedList = await prisma.emailList.update({
      where: {
        id: id,
      },
      data: {
        contacts: {
          connect: {
            id: contactId,
          },
        },
      },
      include: {
        contacts: true,
        _count: {
          select: {
            contacts: true,
          },
        },
      },
    });

    // After successfully adding the contact, trigger sync
    const syncResult = await triggerListSync(id);

    return NextResponse.json({
      ...updatedList,
      message: "Contact added to list successfully",
      alreadyInList: false,
      syncStatus: syncResult ? "syncing" : "failed",
    });
  } catch (error) {
    console.error("Failed to add contact to list:", error);
    return NextResponse.json(
      { error: "Failed to add contact to list" },
      { status: 500 }
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    // Verify the list exists and belongs to the user
    const list = await prisma.emailList.findUnique({
      where: {
        id: id,
        userId: session.user.id,
      },
      select: { id: true },
    });

    if (!list) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    // Get all contacts for this list (without pagination)
    const contacts = await prisma.contact.findMany({
      where: {
        emailLists: {
          some: {
            id: id,
            userId: session.user.id,
          },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    return NextResponse.json({
      contacts,
      total: contacts.length,
    });
  } catch (error) {
    console.error("Failed to fetch list contacts:", error);
    return NextResponse.json(
      { error: "Failed to fetch list contacts" },
      { status: 500 }
    );
  }
}

// Add a new endpoint for bulk adding contacts to a list
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { contactIds } = await request.json();

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      console.log("No valid contact IDs provided in request");
      return NextResponse.json(
        { error: "No contact IDs provided" },
        { status: 400 }
      );
    }

    console.log(
      `Attempting to add ${contactIds.length} contacts to list ${id}`
    );
    console.log(`Contact IDs: ${contactIds.join(", ")}`);

    // Verify list ownership
    const list = await prisma.emailList.findUnique({
      where: {
        id: id,
        userId: session.user.id,
      },
      include: {
        contacts: {
          where: {
            id: { in: contactIds },
          },
          select: {
            id: true,
          },
        },
      },
    });

    if (!list) {
      console.log(
        `List ${id} not found or does not belong to user ${session.user.id}`
      );
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    // Check which contacts are already in the list
    const existingContactIds = list.contacts.map((contact) => contact.id);
    console.log(
      `Found ${existingContactIds.length} contacts already in the list: ${existingContactIds.join(", ")}`
    );

    // Filter out contacts that are already in the list
    const contactsToAdd = contactIds.filter(
      (id) => !existingContactIds.includes(id)
    );
    console.log(
      `Adding ${contactsToAdd.length} new contacts to the list: ${contactsToAdd.join(", ")}`
    );

    if (contactsToAdd.length === 0) {
      console.log("All contacts are already in the list, no action needed");
      return NextResponse.json(
        {
          message: "All contacts are already in the list",
          added: 0,
          skipped: contactIds.length,
          total: existingContactIds.length,
          list: {
            id: list.id,
            name: list.name,
          },
        },
        { status: 409 }
      );
    }

    // Add new contacts to the list
    const updatedList = await prisma.emailList.update({
      where: {
        id: id,
      },
      data: {
        contacts: {
          connect: contactsToAdd.map((contactId) => ({ id: contactId })),
        },
      },
      include: {
        _count: {
          select: {
            contacts: true,
          },
        },
      },
    });

    console.log(
      `Successfully added ${contactsToAdd.length} contacts to list ${id}`
    );
    console.log(`List now has ${updatedList._count.contacts} total contacts`);

    // After successfully adding contacts, trigger sync
    const syncResult = await triggerListSync(id);

    return NextResponse.json({
      message: "Contacts added to list successfully",
      added: contactsToAdd.length,
      skipped: existingContactIds.length,
      total: updatedList._count.contacts,
      list: {
        id: updatedList.id,
        name: list.name,
      },
      syncStatus: syncResult ? "syncing" : "failed",
    });
  } catch (error) {
    console.error("Failed to add contacts to list:", error);
    return NextResponse.json(
      { error: "Failed to add contacts to list" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { contactIds } = await req.json();
    if (!Array.isArray(contactIds)) {
      return new Response("Invalid contact IDs", { status: 400 });
    }

    // Get the list and verify ownership
    const list = await prisma.emailList.findUnique({
      where: {
        id: params.id,
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
      return new Response("List not found", { status: 404 });
    }

    // Get current contact IDs and filter out the ones to remove
    const currentContactIds = list.contacts.map((c) => c.id);
    const updatedContactIds = currentContactIds.filter(
      (id) => !contactIds.includes(id)
    );

    // Update the list with the filtered contacts
    await prisma.emailList.update({
      where: {
        id: params.id,
      },
      data: {
        contacts: {
          set: updatedContactIds.map((id) => ({ id })),
        },
      },
    });

    return NextResponse.json({
      success: true,
      removed: contactIds.length,
    });
  } catch (error) {
    console.error("Failed to remove contacts from list:", error);
    return new Response("Failed to remove contacts", { status: 500 });
  }
}
