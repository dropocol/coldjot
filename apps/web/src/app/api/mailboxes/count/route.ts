// Get the number of mailboxes for a user

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const count = await prisma.mailbox.count({
    where: {
      userId: session.user.id,
    },
  });
  return NextResponse.json({ count });
}
