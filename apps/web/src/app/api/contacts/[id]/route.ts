import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { isNotFound, notFound } from "@/lib/auth/access";
import { parseBody } from "@/lib/http/validation";
import { updateContactSchema } from "@/lib/schemas";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const contact = await prisma.contact.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!contact) {
      return notFound("Contact not found");
    }

    return NextResponse.json(contact);
  } catch (error) {
    logger.error("Error fetching contact:", error);
    return NextResponse.json(
      { error: "Failed to fetch contact" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await parseBody(request, updateContactSchema);
  if (!body.ok) return body.response;
  const { firstName, lastName, email } = body.data;

  try {
    const updatedContact = await prisma.contact.update({
      where: {
        id,
        userId: session.user.id,
      },
      data: {
        firstName,
        lastName,
        name: `${firstName} ${lastName}`,
        email,
      },
    });

    return NextResponse.json(updatedContact);
  } catch (error) {
    if (isNotFound(error)) return notFound("Contact not found");
    logger.error("Error updating contact:", error);
    return NextResponse.json(
      { error: "Failed to update contact" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await parseBody(request, updateContactSchema);
  if (!body.ok) return body.response;
  const data = body.data;

  try {
    // First fetch the existing contact to get current values
    const existingContact = await prisma.contact.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!existingContact) {
      return notFound("Contact not found");
    }

    // Then update with new values
    const updatedContact = await prisma.contact.update({
      where: {
        id,
        userId: session.user.id,
      },
      data: {
        ...(data.firstName !== undefined && { firstName: data.firstName }),
        ...(data.lastName !== undefined && { lastName: data.lastName }),
        ...((data.firstName !== undefined || data.lastName !== undefined) && {
          name: `${data.firstName ?? existingContact.firstName} ${
            data.lastName ?? existingContact.lastName
          }`,
        }),
        ...(data.email !== undefined && { email: data.email }),
      },
    });

    return NextResponse.json(updatedContact);
  } catch (error) {
    if (isNotFound(error)) return notFound("Contact not found");
    logger.error("Error patching contact:", error);
    return NextResponse.json(
      { error: "Failed to patch contact" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Prisma throws P2025 if the row doesn't exist (or belongs to another user,
    // since the where-clause is scoped by userId). Translate that to 404.
    const deletedContact = await prisma.contact.delete({
      where: {
        id,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ success: true, data: deletedContact });
  } catch (error) {
    if (isNotFound(error)) return notFound("Contact not found");
    logger.error("Error deleting contact:", error);
    return NextResponse.json(
      { error: "Failed to delete contact" },
      { status: 500 }
    );
  }
}
