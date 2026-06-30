import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { MAILOPS_BASE_URL, mailopsAuthHeaders } from "@/lib/http/mailops";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ email: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { email } = await params;
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const response = await fetch(
      `${MAILOPS_BASE_URL}/api/mailbox/watch/${encodeURIComponent(email)}`,
      {
        method: "DELETE",
        headers: { ...mailopsAuthHeaders() },
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
