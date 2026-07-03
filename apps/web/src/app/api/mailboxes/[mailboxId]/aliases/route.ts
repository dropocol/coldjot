import { NextResponse } from "next/server";
import { google } from "googleapis";
import { auth } from "@/auth";
import { prisma } from "@coldjot/database";

interface RouteParams {
  params: Promise<{
    mailboxId: string;
  }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { mailboxId } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Verify account ownership and get credentials
    const mailbox = await prisma.mailbox.findUnique({
      where: {
        id: mailboxId,
        userId: session.user.id,
      },
    });

    if (!mailbox) {
      return new NextResponse("Not Found", { status: 404 });
    }

    if (mailbox.provider !== "gmail") {
      return new NextResponse("Only Gmail accounts supported", { status: 400 });
    }

    // Initialize Gmail client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID_EMAIL,
      process.env.GOOGLE_CLIENT_SECRET_EMAIL,
      process.env.GOOGLE_REDIRECT_URI_EMAIL
    );

    oauth2Client.setCredentials({
      access_token: mailbox.access_token,
      refresh_token: mailbox.refresh_token,
      expiry_date: mailbox.expires_at ? mailbox.expires_at * 1000 : undefined,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    try {
      // Fetch Gmail settings including send-as aliases
      const { data: settings } = await gmail.users.settings.sendAs.list({
        userId: "me",
      });

      // Transform Gmail sendAs into our alias format
      const aliases =
        settings.sendAs
          ?.filter((sendAs) => sendAs.isPrimary !== true) // Exclude primary email
          .map((sendAs) => ({
            id: sendAs.sendAsEmail, // Use email as ID since Gmail doesn't provide one
            alias: sendAs.sendAsEmail,
            name: sendAs.displayName || null,
            mailboxId: mailboxId,
            isDefault: sendAs.isDefault || false,
          })) || [];

      return NextResponse.json(aliases);
    } catch (error) {
      // Gaxios-style error: has .message and an optional .response.data payload.
      const gerr = error as { message?: string; response?: { data?: unknown } };
      console.error("[GMAIL_ALIASES_GET] Gmail API Error:", {
        message: gerr.message,
        response: gerr.response?.data,
      });
      return new NextResponse("Failed to fetch Gmail aliases", { status: 500 });
    }
  } catch (error) {
    console.error("[EMAIL_ALIASES_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

// Remove POST endpoint since aliases are managed through Gmail
