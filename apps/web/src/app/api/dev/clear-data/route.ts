import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";

export async function DELETE(_req: Request) {
  try {
    // Only allow in development
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Not allowed in production", { status: 403 });
    }

    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const userId = session.user.id;

    // Delete all user's data in a transaction
    await prisma.$transaction([
      prisma.draft.deleteMany({ where: { userId } }),
      prisma.contact.deleteMany({ where: { userId } }),
      prisma.template.deleteMany({ where: { userId } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error clearing test data:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
