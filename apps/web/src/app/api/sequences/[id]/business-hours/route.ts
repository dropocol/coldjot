import { NextResponse } from "next/server";
import { prisma } from "@coldjot/database";
import { auth } from "@/auth";
import type { BusinessHours, BusinessScheduleType } from "@coldjot/types";
import { updateSequenceReadinessField } from "@/lib/metadata-utils";

interface UpdateBusinessHoursBody extends Omit<BusinessHours, "holidays"> {
  scheduleType: BusinessScheduleType;
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
    const { timezone, workDays, workHoursStart, workHoursEnd, scheduleType } =
      body;

    // Validate the sequence belongs to the user
    const sequence = await prisma.sequence.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        businessHours: true,
      },
    });

    if (!sequence) {
      return new NextResponse("Sequence not found", { status: 404 });
    }

    // Check if business hours already exist
    const hasExistingBusinessHours = !!sequence.businessHours;

    // Start a transaction to update both sequence and business hours
    const result = await prisma.$transaction(
      async (tx) => {
        // Update sequence schedule type
        await tx.sequence.update({
          where: { id },
          data: { scheduleType: scheduleType },
        });

        // Always upsert business hours regardless of schedule type
        const businessHours = await tx.businessHours.upsert({
          where: { sequenceId: id },
          create: {
            userId: session.user.id,
            sequenceId: id,
            timezone,
            workDays: workDays || [],
            workHoursStart,
            workHoursEnd,
            type: scheduleType,
          },
          update: {
            type: scheduleType,
            timezone,
            workDays: workDays || [],
            workHoursStart,
            workHoursEnd,
          },
        });

        return {
          scheduleType,
          timezone: businessHours.timezone,
          workDays: businessHours.workDays,
          workHoursStart: businessHours.workHoursStart,
          workHoursEnd: businessHours.workHoursEnd,
          type: businessHours.type,
        };
      },
      {
        timeout: 30000, // Set transaction timeout to 30 seconds
      }
    );

    if (!hasExistingBusinessHours) {
      // Update readiness field outside of transaction
      await updateSequenceReadinessField(id, "hasBusinessHours", true);
    }

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

    // Delete business hours first
    await prisma.businessHours.delete({
      where: {
        sequenceId: id,
      },
    });

    // Update metadata to indicate no business hours (outside of any transaction)
    await updateSequenceReadinessField(id, "hasBusinessHours", false);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting business hours:", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
