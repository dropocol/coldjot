import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@coldjot/database";

interface RouteParams {
  params: Promise<{
    mailboxId: string;
  }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { mailboxId } = await params;
    const account = await prisma.mailbox.findUnique({
      where: {
        id: mailboxId,
        userId: session.user.id,
      },
      include: {
        aliases: true,
      },
    });

    if (!account) {
      return new NextResponse("Not Found", { status: 404 });
    }

    return NextResponse.json(account);
  } catch (error) {
    console.error("[EMAIL_ACCOUNT_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { mailboxId } = await params;
    const body = await req.json();
    const { isActive, name } = body;

    // Get current account to merge settings
    const currentAccount = await prisma.mailbox.findUnique({
      where: {
        id: mailboxId,
        userId: session.user.id,
      },
    });

    if (!currentAccount) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const account = await prisma.mailbox.update({
      where: {
        id: mailboxId,
        userId: session.user.id,
      },
      data: {
        ...(isActive !== undefined && { isActive }),
        ...(name !== undefined && { name }),
      },
      include: {
        aliases: true,
      },
    });

    return NextResponse.json(account);
  } catch (error) {
    console.error("[EMAIL_ACCOUNT_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { mailboxId } = await params;

    // Get the mailbox first to get its email
    const mailbox = await prisma.mailbox.findUnique({
      where: {
        id: mailboxId,
        userId: session.user.id,
      },
    });

    if (!mailbox) {
      return new NextResponse("Not Found", { status: 404 });
    }

    // First, stop the Gmail watch
    try {
      const stopWatchResponse = await fetch(
        `${process.env.NEXT_PUBLIC_MAILOPS_API_URL}/mailbox/watch/${encodeURIComponent(mailbox.email)}`,
        {
          method: "DELETE",
        }
      );

      if (!stopWatchResponse.ok) {
        console.error(
          "[EMAIL_ACCOUNT_DELETE] Failed to stop watch:",
          await stopWatchResponse.text()
        );
        // Continue with deletion even if watch stop fails
      } else {
        console.log(
          "[EMAIL_ACCOUNT_DELETE] Successfully stopped watch for:",
          mailbox.email
        );
      }

      // Wait a moment to ensure watch is stopped
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (watchError) {
      console.error("[EMAIL_ACCOUNT_DELETE] Error stopping watch:", watchError);
      // Continue with deletion even if watch stop fails
    }

    // Then delete the mailbox
    await prisma.mailbox.delete({
      where: {
        id: mailboxId,
        userId: session.user.id,
      },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[EMAIL_ACCOUNT_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
