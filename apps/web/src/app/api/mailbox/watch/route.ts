import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
// import { authOptions } from "@/auth";

const MAILOPS_URL = process.env.NEXT_PUBLIC_MAILOPS_API_URL;

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { userId, email } = body;

    if (!userId || !email) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const response = await fetch(`${MAILOPS_URL}/mailbox/watch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId, email }),
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(error, { status: response.status });
    }

    return NextResponse.json({ message: "Watch setup successful" });
  } catch (error) {
    console.error("Failed to setup mailbox watch:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
