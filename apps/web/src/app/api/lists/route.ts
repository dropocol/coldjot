import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") ?? "1");
    const limit = parseInt(searchParams.get("limit") ?? "20");
    const query = searchParams.get("q");

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.EmailListWhereInput = {
      userId: session.user.id,
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
    };

    // Get lists with pagination
    const [lists, total] = await Promise.all([
      prisma.emailList.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          contacts: true,
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
    console.error("Failed to fetch lists:", error);
    return NextResponse.json(
      { error: "Failed to fetch lists" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const json = await request.json();
    const { name, description, contacts, tags } = json;

    const list = await prisma.emailList.create({
      data: {
        name,
        description,
        tags: tags || [],
        userId: session.user.id,
        contacts: {
          connect: contacts.map((id: string) => ({ id })),
        },
      },
      include: {
        contacts: true,
      },
    });

    return NextResponse.json(list);
  } catch (error) {
    console.error("Failed to create list:", error);
    return NextResponse.json(
      { error: "Failed to create list" },
      { status: 500 }
    );
  }
}
