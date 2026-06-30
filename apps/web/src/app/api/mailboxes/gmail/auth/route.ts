"use server";

import { NextResponse } from "next/server";
import { google } from "googleapis";
import { auth } from "@/auth";
import { encrypt } from "@/lib/crypto";
import { logger } from "@/lib/logger";

// Verify credentials are loaded
if (
  !process.env.GOOGLE_CLIENT_ID_EMAIL ||
  !process.env.GOOGLE_CLIENT_SECRET_EMAIL
) {
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get return path from request body with safe parsing
    let returnPath = "/settings";
    try {
      const body = await request.json();
      returnPath = body.returnPath || returnPath;
    } catch {
      // No body provided or invalid JSON — use default returnPath.
    }

    // Generate OAuth URL
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent",
      state: encrypt(JSON.stringify({ userId: session.user.id, returnPath })),
    });

    return NextResponse.json({ url });
  } catch (error) {
    logger.error("[GMAIL_AUTH] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
