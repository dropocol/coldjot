import { auth } from "@/auth";
import { queueApi } from "@/lib/queue/queue-api-client";
import { NextResponse } from "next/server";

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

    // Reset the sequence using queue API
    const _result = await queueApi.resetSequence(id, session.user.id);

    return NextResponse.json({
      success: true,
      message: "Sequence reset successfully",
    });
  } catch (error) {
    console.error("[SEQUENCE_RESET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
