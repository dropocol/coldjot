import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { id, contactId } = await params;
    const sequence = await prisma.sequence.findUnique({
      where: {
        id: id,
        userId: session.user.id,
      },
    });

    if (!sequence) {
      return new NextResponse("Not found", { status: 404 });
    }

    // Soft-remove: keep the row as a tombstone so list-sync can see and respect
    // the removal (it dedups against active rows only). Also clear any pending
    // schedule + mark completed so mailops never dispatches this contact again.
    // Only act on an active row (removedAt: null) — idempotent; 404 if absent.
    const result = await prisma.sequenceContact.updateMany({
      where: {
        sequenceId: id,
        contactId,
        removedAt: null,
      },
      data: {
        removedAt: new Date(),
        nextScheduledAt: null,
        completed: true,
      },
    });

    if (result.count === 0) {
      return new NextResponse("Not found", { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[SEQUENCE_CONTACT_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
