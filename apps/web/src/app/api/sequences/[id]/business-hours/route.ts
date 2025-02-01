import { NextResponse } from "next/server";
import { prisma } from "@coldjot/database";
import { auth } from "@/auth";
import type { BusinessHours, BusinessScheduleType } from "@coldjot/types";

interface UpdateBusinessHoursBody extends Omit<BusinessHours, "holidays"> {
  scheduleType: BusinessScheduleType;
  holidays: string[];
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = await auth();
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const sequence = await prisma.sequence.findUnique({
      where: { id },
      include: {
        businessHours: true,
      },
    });

    if (!sequence) {
      return new NextResponse("Sequence not found", { status: 404 });
    }

    return NextResponse.json({
      scheduleType: sequence.scheduleType,
      ...(sequence.businessHours && {
        timezone: sequence.businessHours.timezone,
        workDays: sequence.businessHours.workDays,
        workHoursStart: sequence.businessHours.workHoursStart,
        workHoursEnd: sequence.businessHours.workHoursEnd,
        holidays: sequence.businessHours.holidays,
      }),
    });
  } catch (error) {
    console.error("Error fetching business hours:", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = await auth();
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = (await request.json()) as UpdateBusinessHoursBody;
    const {
      timezone,
      workDays,
      workHoursStart,
      workHoursEnd,
      holidays,
      scheduleType,
    } = body;

    // Validate the sequence belongs to the user
    const sequence = await prisma.sequence.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!sequence) {
      return new NextResponse("Sequence not found", { status: 404 });
    }

    // Start a transaction to update both sequence and business hours
    const result = await prisma.$transaction(async (tx) => {
      // Update sequence schedule type
      const updatedSequence = await tx.sequence.update({
        where: { id },
        data: { scheduleType },
      });

      if (scheduleType === "business") {
        // Upsert business hours for business schedule type
        const businessHours = await tx.businessHours.upsert({
          where: { sequenceId: id },
          create: {
            userId: session.user.id,
            sequenceId: id,
            timezone,
            workDays,
            workHoursStart,
            workHoursEnd,
            holidays: holidays.map((dateStr) => new Date(dateStr)),
          },
          update: {
            timezone,
            workDays,
            workHoursStart,
            workHoursEnd,
            holidays: holidays.map((dateStr) => new Date(dateStr)),
          },
        });

        return {
          scheduleType,
          timezone: businessHours.timezone,
          workDays: businessHours.workDays,
          workHoursStart: businessHours.workHoursStart,
          workHoursEnd: businessHours.workHoursEnd,
          holidays: businessHours.holidays,
        };
      } else {
        // Delete business hours for custom schedule type
        await tx.businessHours.deleteMany({
          where: { sequenceId: id },
        });

        return {
          scheduleType,
          timezone,
          workDays,
          workHoursStart,
          workHoursEnd,
          holidays,
        };
      }
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error updating business hours:", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Validate the sequence belongs to the user
    const { id } = await params;
    const sequence = await prisma.sequence.findFirst({
      where: {
        id: id,
        userId: session.user.id,
      },
    });

    if (!sequence) {
      return new NextResponse("Sequence not found", { status: 404 });
    }

    await prisma.businessHours.delete({
      where: {
        sequenceId: id,
      },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting business hours:", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
