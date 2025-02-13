import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const json = await req.json();
    const { name, permissions, schedule } = json;

    const sequence = await prisma.sequence.create({
      data: {
        name,
        accessLevel: permissions,
        scheduleType: schedule,
        status: "draft",
        userId: session.user.id,
      },
      include: {
        steps: true,
        contacts: true,
      },
    });

    return NextResponse.json(sequence);
  } catch (error) {
    console.error("[SEQUENCES_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

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
    const where: Prisma.SequenceWhereInput = {
      userId: session.user.id,
      ...(query
        ? {
            name: {
              contains: query,
              mode: "insensitive",
            },
          }
        : {}),
    };

    // Get sequences with pagination
    const [sequences, total] = await Promise.all([
      prisma.sequence.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          steps: {
            orderBy: {
              order: "asc",
            },
          },
          contacts: {
            include: {
              contact: true,
            },
          },
          _count: {
            select: {
              contacts: true,
            },
          },
        },
        skip,
        take: limit,
      }),
      prisma.sequence.count({ where }),
    ]);

    // Transform the data to match the expected interface
    const transformedSequences = sequences.map((sequence) => ({
      ...sequence,
      status: sequence.status,
      contacts: sequence.contacts.map((sc) => sc.contact),
      _count: {
        ...sequence._count,
        contacts: sequence._count.contacts,
      },
    }));

    return NextResponse.json({
      sequences: transformedSequences,
      total,
      page,
      limit,
      hasMore: skip + sequences.length < total,
      nextPage: skip + sequences.length < total ? page + 1 : undefined,
    });
  } catch (error) {
    console.error("Failed to fetch sequences:", error);
    return NextResponse.json(
      { error: "Failed to fetch sequences" },
      { status: 500 }
    );
  }
}
