import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { createGmailDraft } from "@/lib/google/gmail";
import { refreshAccessToken } from "@/lib/google/google-account";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json();
  const { contactId, templateId, content } = json;

  try {
    // TODO : Get google account
    // Get the user's account with tokens
    const account = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: "google",
      },
      select: {
        access_token: true,
        refresh_token: true,
        providerAccountId: true,
        userId: true,
      },
    });

    if (!account?.access_token || !account?.refresh_token) {
      return NextResponse.json(
        { error: "No access token found" },
        { status: 401 }
      );
    }

    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
    });

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const fullContent = [content].join("\n\n");

    try {
      // Try to create draft with current access token
      const gmailDraftId = await createGmailDraft({
        accessToken: account.access_token,
        to: contact.email,
        subject: "Draft Email",
        content: fullContent,
      });

      // Save the draft in our database
      const draft = await prisma.draft.create({
        data: {
          userId: session.user.id,
          contactId,
          templateId,
          content: fullContent,
          gmailDraftId,
        },
      });

      return NextResponse.json(draft);
    } catch (error) {
      if (error instanceof Error && error.message === "TOKEN_EXPIRED") {
        // Refresh the token
        const newAccessToken = await refreshAccessToken(
          account.userId,
          account.refresh_token
        );

        // Update the token in the database
        // TODO :  save the expiration date
        // await prisma.account.update({
        //   where: {
        //     provider_providerAccountId: {
        //       provider: "google",
        //       providerAccountId: account.providerAccountId,
        //     },
        //   },
        //   data: {
        //     access_token: newAccessToken,
        //   },
        // });

        // Retry with new token
        const gmailDraftId = await createGmailDraft({
          accessToken: newAccessToken as string,
          to: contact.email,
          subject: "Draft Email",
          content: fullContent,
        });

        const draft = await prisma.draft.create({
          data: {
            userId: session.user.id,
            contactId,
            templateId,
            content: fullContent,
            gmailDraftId,
          },
        });

        return NextResponse.json(draft);
      }
      throw error;
    }
  } catch (error) {
    console.error("Failed to create draft:", error);
    return NextResponse.json(
      { error: "Failed to create draft" },
      { status: 500 }
    );
  }
}
