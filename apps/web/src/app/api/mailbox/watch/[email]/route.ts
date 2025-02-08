import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

const MAILOPS_URL = process.env.NEXT_PUBLIC_MAILOPS_API_URL;

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ email: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { email } = await params;
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const response = await fetch(
      `${MAILOPS_URL}/mailbox/watch/${encodeURIComponent(email)}`,
      {
        method: "DELETE",
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(error, { status: response.status });
    }

    return NextResponse.json({ message: "Watch stopped successfully" });
  } catch (error) {
    console.error("Failed to stop mailbox watch:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
