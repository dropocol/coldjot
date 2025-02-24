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
    const where: Prisma.ContactWhereInput = {
      userId: session.user.id,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" as const } },
              { email: { contains: query, mode: "insensitive" as const } },
              { firstName: { contains: query, mode: "insensitive" as const } },
              { lastName: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    // Get contacts with pagination
    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
      prisma.contact.count({ where }),
    ]);

    return NextResponse.json({
      contacts,
      total,
      page,
      limit,
      hasMore: skip + contacts.length < total,
      nextPage: skip + contacts.length < total ? page + 1 : undefined,
    });
  } catch (error) {
    console.error("Failed to fetch contacts:", error);
    return NextResponse.json(
      { error: "Failed to fetch contacts" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) {
      return new Response("Unauthorized", { status: 401 });
    }

    const json = await req.json();
    const { firstName, lastName, email } = json;

    // Before creating, check if the contact already exists
    const existingContact = await prisma.contact.findUnique({
      where: {
        userId_email: {
          userId: session.user.id,
          email,
        },
      },
    });

    if (existingContact) {
      // return NextResponse.json(existingContact);
      return NextResponse.json(
        {
          error: "Email already exists in your contacts",
        },
        { status: 409 }
      );
    }

    const contact = await prisma.contact.create({
      data: {
        firstName,
        lastName,
        name: `${firstName} ${lastName}`,
        email,
        userId: session.user.id,
      },
    });

    return NextResponse.json(contact);
  } catch (error) {
    console.error("Failed to create contact:", error);
    return NextResponse.json(
      { error: "Failed to create contact" },
      { status: 500 }
    );
  }
}
