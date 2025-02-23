// Get the number of mailboxes for a user

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

const handler = async (req: NextRequest, res: NextResponse) => {
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
};

export { handler as GET };
