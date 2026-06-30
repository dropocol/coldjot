import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { isNotFound } from "@/lib/auth/access";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Check if user is authenticated and is admin
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Explicit null check on email — previously used a non-null assertion which
  // could match an arbitrary user if the session lacked an email.
  if (!session.user.email) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  try {
    // Get user from database to check admin status
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (user?.role !== "admin") {
      return new NextResponse("Forbidden", { status: 403 });
    }

    // Prevent deleting yourself
    if (user.id === id) {
      return new NextResponse("Cannot delete yourself", { status: 400 });
    }

    // Delete user — Prisma throws P2025 if the user doesn't exist
    await prisma.user.delete({
      where: { id: id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (isNotFound(error)) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.error("[ADMIN_USER_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
