import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

// Get lists attached to a sequence
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
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") ?? "1");
    const limit = parseInt(searchParams.get("limit") ?? "10");
    const query = searchParams.get("q");

    const skip = (page - 1) * limit;

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

    // Build where clause for lists
    const where = {
      sequences: {
        some: {
          id,
        },
      },
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" as const } },
              {
                description: { contains: query, mode: "insensitive" as const },
              },
            ],
          }
        : {}),
    } as Prisma.EmailListWhereInput;

    // Get lists with pagination
    const [lists, total] = await Promise.all([
      prisma.emailList.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          _count: {
            select: {
              contacts: true,
            },
          },
        },
        skip,
        take: limit,
      }),
      prisma.emailList.count({ where }),
    ]);

    return NextResponse.json({
      lists,
      total,
      page,
      limit,
      hasMore: skip + lists.length < total,
      nextPage: skip + lists.length < total ? page + 1 : undefined,
    });
  } catch (error) {
    console.error("[SEQUENCE_LISTS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

// Add a list to a sequence
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { id } = await params;
    const { listId } = await req.json();

    if (!listId) {
      return new NextResponse("List ID is required", { status: 400 });
    }

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
    });

    if (!list) {
      return new NextResponse("List not found", { status: 404 });
    }

    // Check if list is already attached to sequence
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

    if (existingConnection) {
      return new NextResponse("List already attached to sequence", {
        status: 400,
      });
    }

    // Add list to sequence
    await prisma.sequence.update({
      where: {
        id,
      },
      data: {
        lists: {
          connect: {
            id: listId,
          },
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[SEQUENCE_LISTS_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
