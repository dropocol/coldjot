import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";

// Remove a list from a sequence
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; listId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { id, listId } = await params;

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

    // Check if list is attached to sequence
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

    if (!existingConnection) {
      return new NextResponse("List not attached to sequence", {
        status: 400,
      });
    }

    // Remove list from sequence
    await prisma.sequence.update({
      where: {
        id,
      },
      data: {
        lists: {
          disconnect: {
            id: listId,
          },
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[SEQUENCE_LIST_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
