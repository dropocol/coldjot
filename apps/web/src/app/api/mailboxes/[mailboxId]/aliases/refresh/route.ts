import { NextResponse } from "next/server";
import { google } from "googleapis";
import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { gmail_v1 } from "googleapis";

interface RouteParams {
  params: Promise<{
    mailboxId: string;
  }>;
}

type Schema$SendAs = gmail_v1.Schema$SendAs;

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { mailboxId } = await params;

    // Verify account ownership and get credentials
    const mailbox = await prisma.mailbox.findUnique({
      where: {
        id: mailboxId,
        userId: session.user.id,
      },
      include: {
        aliases: true,
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

      // Get current aliases
      const currentAliases = new Set(mailbox.aliases.map((a) => a.alias));

      // Filter out primary email and prepare alias data
      const gmailAliases = new Set(
        settings.sendAs
          ?.filter((sendAs) => !sendAs.isPrimary && sendAs.sendAsEmail)
          .map((sendAs) => sendAs.sendAsEmail as string) || []
      );

      // Find aliases to create and delete
      const aliasesToCreate = Array.from(gmailAliases)
        .filter((alias) => !currentAliases.has(alias))
        .map((alias) => {
          const sendAs = settings.sendAs?.find((s) => s.sendAsEmail === alias);
          return {
            alias,
            name: sendAs?.displayName || null,
            mailboxId: mailboxId,
          };
        });

      const aliasesToDelete = Array.from(currentAliases).filter(
        (alias) => !gmailAliases.has(alias as string)
      );

      // Perform updates in a transaction
      await prisma.$transaction(async (tx) => {
        // Delete removed aliases
        if (aliasesToDelete.length > 0) {
          await tx.emailAlias.deleteMany({
            where: {
              mailboxId: mailboxId,
              alias: { in: aliasesToDelete },
            },
          });
        }

        // Create new aliases
        if (aliasesToCreate.length > 0) {
          await tx.emailAlias.createMany({
            data: aliasesToCreate,
          });
        }
      });

      // Fetch updated account with aliases
      const updatedAccount = await prisma.mailbox.findUnique({
        where: { id: mailboxId },
        include: { aliases: true },
      });

      if (!updatedAccount) {
        throw new Error("Failed to fetch updated account");
      }

      return NextResponse.json(updatedAccount);
    } catch (error: any) {
      console.error("[GMAIL_ALIASES_REFRESH] Gmail API Error:", {
        message: error.message,
        response: error.response?.data,
      });
      return new NextResponse("Failed to refresh Gmail aliases", {
        status: 500,
      });
    }
  } catch (error) {
    console.error("[EMAIL_ALIASES_REFRESH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
