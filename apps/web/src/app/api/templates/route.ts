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
    const where: Prisma.TemplateWhereInput = {
      userId: session.user.id,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" as const } },
              { subject: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    // Get templates with pagination
    const [templates, total] = await Promise.all([
      prisma.template.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
      prisma.template.count({ where }),
    ]);

    return NextResponse.json({
      templates,
      total,
      page,
      limit,
      hasMore: skip + templates.length < total,
      nextPage: skip + templates.length < total ? page + 1 : undefined,
    });
  } catch (error) {
    console.error("Failed to fetch templates:", error);
    return NextResponse.json(
      { error: "Failed to fetch templates" },
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

    const body = await req.json();
    const template = await prisma.template.create({
      data: {
        ...body,
        userId: session.user.id,
      },
    });

    return NextResponse.json(template);
  } catch (error) {
    console.error("Failed to create template:", error);
    return NextResponse.json(
      { error: "Failed to create template" },
      { status: 500 }
    );
  }
}
