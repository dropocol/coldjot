import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";
import {
  findForeignContactIds,
  forbidden,
  isNotFound,
  notFound,
} from "@/lib/auth/access";
import { parseBody } from "@/lib/http/validation";
import { updateListSchema } from "@coldjot/types/schemas";

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
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") ?? "1");
    const limit = parseInt(searchParams.get("limit") ?? "10");
    const skip = (page - 1) * limit;

    // First get the list without contacts to get basic info
    const list = await prisma.emailList.findUnique({
      where: {
        id: id,
        userId: session.user.id,
      },
    });

    if (!list) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    // Then get paginated contacts and total count
    const [contacts, totalContacts] = await Promise.all([
      prisma.contact.findMany({
        where: {
          emailLists: {
            some: {
              id: id,
              userId: session.user.id,
            },
          },
        },
        skip,
        take: limit,
        orderBy: {
          firstName: "asc",
        },
      }),
      prisma.contact.count({
        where: {
          emailLists: {
            some: {
              id: id,
              userId: session.user.id,
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      ...list,
      contacts,
      _pagination: {
        total: totalContacts,
        page,
        limit,
        hasMore: skip + contacts.length < totalContacts,
        nextPage: skip + contacts.length < totalContacts ? page + 1 : undefined,
      },
    });
  } catch (error) {
    console.error("Failed to fetch list:", error);
    return NextResponse.json(
      { error: "Failed to fetch list" },
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

  try {
    const { id } = await params;
    const body = await parseBody(request, updateListSchema);
    if (!body.ok) return body.response;
    const { name, description, contacts, tags } = body.data;

    // IDOR guard: verify ALL referenced contacts belong to the caller before
    // re-pointing the list. Without this, a user could attach another tenant's
    // contacts to their own list by passing arbitrary ids.
    if (contacts && contacts.length > 0) {
      const foreign = await findForeignContactIds(session.user.id, contacts);
      if (foreign.size > 0) {
        return forbidden("Some contacts do not belong to this account");
      }
    }

    const list = await prisma.emailList.update({
      where: {
        id: id,
        userId: session.user.id,
      },
      data: {
        name,
        description,
        tags,
        contacts: contacts
          ? { set: contacts.map((id: string) => ({ id })) }
          : undefined,
      },
      include: {
        contacts: true,
      },
    });

    return NextResponse.json(list);
  } catch (error) {
    if (isNotFound(error)) return notFound("List not found");
    console.error("Failed to update list:", error);
    return NextResponse.json(
      { error: "Failed to update list" },
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

  try {
    const { id } = await params;
    await prisma.emailList.delete({
      where: {
        id: id,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (isNotFound(error)) return notFound("List not found");
    console.error("Failed to delete list:", error);
    return NextResponse.json(
      { error: "Failed to delete list" },
      { status: 500 }
    );
  }
}
