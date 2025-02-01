import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const template = await prisma.template.findUnique({
      where: {
        id: id,
        userId: session.user.id,
      },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(template);
  } catch (error) {
    console.error("[TEMPLATE_GET]", error);
    return NextResponse.json(
      { error: "Failed to fetch template" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json();
  const { name, content, subject } = json;

  const template = await prisma.template.update({
    where: {
      id: id,
      userId: session.user.id,
    },
    data: {
      name,
      subject,
      content,
    },
  });

  return NextResponse.json(template);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.template.delete({
    where: {
      id: id,
      userId: session.user.id,
    },
  });

  return new NextResponse(null, { status: 204 });
}
