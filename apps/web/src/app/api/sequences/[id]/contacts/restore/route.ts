import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";
import { z } from "zod";

const restoreSchema = z.object({
  contactIds: z.array(z.string().min(1)).min(1).max(1000),
});

/**
 * Restore previously-removed contacts to a sequence (clear the removedAt
 * tombstone + reset send-state so they're ready to send again).
 *
 * Body: { contactIds: string[] } (1..1000).
 *
 * Only rows that are actually removed (removedAt != null) are flipped; rows
 * that are already active are a no-op and don't count toward the response.
 * Ownership is enforced via the sequence (userId match).
 *
 * Restore is a manual, per-sequence action. The background list-sync respects
 * the tombstone, so a restored contact will NOT be re-removed by sync.
 */
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

    // Verify sequence ownership.
    const sequence = await prisma.sequence.findUnique({
      where: {
        id,
        userId: session.user.id,
      },
      select: { id: true },
    });

    if (!sequence) {
      return new NextResponse("Not found", { status: 404 });
    }

    const body = restoreSchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }
    const { contactIds } = body.data;

    const result = await prisma.sequenceContact.updateMany({
      where: {
        sequenceId: id,
        contactId: { in: contactIds },
        removedAt: { not: null },
      },
      data: {
        removedAt: null,
        // reset send-state for a fresh start
        status: "not_sent",
        currentStep: 0,
        completed: false,
        nextScheduledAt: null,
        failureCount: 0,
        lastError: null,
      },
    });

    return NextResponse.json({ success: true, restored: result.count });
  } catch (error) {
    console.error("[SEQUENCE_CONTACT_RESTORE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
