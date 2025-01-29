import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@coldjot/database";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const mailboxes = await prisma.mailbox.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        aliases: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(mailboxes);
  } catch (error) {
    console.error("[MAILBOXES_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    const { id, ...data } = await req.json();

    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!id) {
      return new NextResponse("Missing mailbox ID", { status: 400 });
    }

    const mailbox = await prisma.mailbox.update({
      where: {
        id,
        userId: session.user.id,
      },
      data,
    });

    return NextResponse.json(mailbox);
  } catch (error) {
    console.error("[MAILBOXES_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!id) {
      return new NextResponse("Missing mailbox ID", { status: 400 });
    }

    const mailbox = await prisma.mailbox.delete({
      where: {
        id,
        userId: session.user.id,
      },
    });

    return NextResponse.json(mailbox);
  } catch (error) {
    console.error("[MAILBOXES_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
