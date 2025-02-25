"use server";

import { NextResponse } from "next/server";
import { google } from "googleapis";
import { auth } from "@/auth";
import { encrypt } from "@/lib/crypto";

// Verify credentials are loaded
if (
  !process.env.GOOGLE_CLIENT_ID_EMAIL ||
  !process.env.GOOGLE_CLIENT_SECRET_EMAIL
) {
  console.error("Missing Gmail OAuth credentials for email accounts");
  throw new Error("Missing Gmail OAuth credentials for email accounts");
}

const SCOPES = [
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://mail.google.com/",
];

export async function POST(request: Request) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID_EMAIL,
    process.env.GOOGLE_CLIENT_SECRET_EMAIL,
    process.env.GOOGLE_REDIRECT_URI_EMAIL
  );

  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      console.error("[GMAIL_AUTH] No authenticated user");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get return path from request body
    const { returnPath = "/settings" } = await request.json();

    // Log OAuth configuration
    console.log("OAuth Configuration:", {
      clientId: process.env.GOOGLE_CLIENT_ID_EMAIL?.slice(0, 30) + "...",
      redirectUri: process.env.GOOGLE_REDIRECT_URI_EMAIL,
      scopes: SCOPES,
    });

    // Generate OAuth URL
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent",
      state: encrypt(JSON.stringify({ userId: session.user.id, returnPath })),
    });

    console.log("[GMAIL_AUTH] Generated OAuth URL:", url.slice(0, 100) + "...");

    return NextResponse.json({ url });
  } catch (error: any) {
    console.error("[GMAIL_AUTH] Error:", {
      message: error.message,
      stack: error.stack,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
