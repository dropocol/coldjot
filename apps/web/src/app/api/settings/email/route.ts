import { auth } from "@/auth";

import { NextResponse } from "next/server";

// export async function GET() {
//   const session = await auth();
//   if (!session?.user?.id) {
//     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//   }

//   const settings = await prisma.emailSettings.findUnique({
//     where: { userId: session.user.id },
//   });

//   return NextResponse.json(settings);
// }

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json();
  const { _defaultSubject, _defaultSignature } = json;

  // const settings = await prisma.emailSettings.upsert({
  //   where: { userId: session.user.id },
  //   update: {
  //     defaultSubject,
  //     defaultSignature,
  //   },
  //   create: {
  //     userId: session.user.id,
  //     defaultSubject,
  //     defaultSignature,
  //   },
  // });

  // return NextResponse.json(settings);
}
