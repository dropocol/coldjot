import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";
import { updateSequenceReadinessMetadata } from "@/lib/metadata-utils";

/**
 * Updates the metadata for a sequence
 * This endpoint calculates and stores the readiness status of a sequence
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

    // Use the centralized function to update metadata
    const metadata = await updateSequenceReadinessMetadata(id);

    return NextResponse.json({
      success: true,
      metadata,
    });
  } catch (error) {
    console.error("[SEQUENCE_METADATA_UPDATE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
