import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@coldjot/database";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      timezone,
      workDays,
      workHoursStart,
      workHoursEnd,
      type = "default",
    } = body;

    // Validate required fields
    if (!timezone || !workDays || !workHoursStart || !workHoursEnd) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Find existing business hours
    const existingBusinessHours = await prisma.businessHours.findFirst({
      where: {
        userId: session.user.id,
        type,
      },
    });

    // Create or update business hours
    const businessHours = existingBusinessHours
      ? await prisma.businessHours.update({
          where: { id: existingBusinessHours.id },
          data: {
            timezone,
            workDays,
            workHoursStart,
            workHoursEnd,
          },
        })
      : await prisma.businessHours.create({
          data: {
            userId: session.user.id,
            timezone,
            workDays,
            workHoursStart,
            workHoursEnd,
            type,
          },
        });

    return NextResponse.json(businessHours);
  } catch (error) {
    console.error("[BUSINESS_HOURS_API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
