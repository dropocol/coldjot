import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";
import type { BusinessHours } from "@coldjot/types";

interface UpdateSettingsBody {
  name?: string;
  accessLevel?: "team" | "private";
  testMode?: boolean;
  disableSending?: boolean;
  scheduleType?: "business" | "custom";
  businessHours?: BusinessHours;
  testEmails?: string[];
  mailboxId?: string;
  aliasId?: string | null;
  clearDeprecatedMailboxId?: boolean;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const json: UpdateSettingsBody = await request.json();

    // Validate the request
    if (
      json.scheduleType &&
      !["business", "custom"].includes(json.scheduleType)
    ) {
      return NextResponse.json(
        { error: "Invalid schedule type" },
        { status: 400 }
      );
    }

    // Start building the update data
    const updateData: any = {};

    // Handle basic fields
    if (json.name !== undefined) updateData.name = json.name;
    if (json.accessLevel !== undefined)
      updateData.accessLevel = json.accessLevel;
    if (json.testMode !== undefined) updateData.testMode = json.testMode;
    if (json.disableSending !== undefined)
      updateData.disableSending = json.disableSending;
    if (json.scheduleType !== undefined)
      updateData.scheduleType = json.scheduleType;
    if (json.testEmails !== undefined) updateData.testEmails = json.testEmails;

    // Get the current sequence with its business hours
    const existingSequence = await prisma.sequence.findUnique({
      where: { id },
      include: {
        businessHours: true,
        sequenceMailbox: true,
      },
    });

    if (!existingSequence) {
      return NextResponse.json(
        { error: "Sequence not found" },
        { status: 404 }
      );
    }

    // Handle business hours
    if (json.businessHours) {
      if (existingSequence.businessHours) {
        // Update existing business hours
        await prisma.businessHours.update({
          where: { id: existingSequence.businessHours.id },
          data: {
            timezone: json.businessHours.timezone,
            workDays: json.businessHours.workDays,
            workHoursStart: json.businessHours.workHoursStart,
            workHoursEnd: json.businessHours.workHoursEnd,
            holidays: json.businessHours.holidays || [],
          },
        });
      } else {
        // Create new business hours
        await prisma.businessHours.create({
          data: {
            userId: session.user.id,
            sequenceId: id,
            timezone: json.businessHours.timezone,
            workDays: json.businessHours.workDays,
            workHoursStart: json.businessHours.workHoursStart,
            workHoursEnd: json.businessHours.workHoursEnd,
            holidays: json.businessHours.holidays || [],
          },
        });
      }
    }

    // Handle mailbox and alias updates
    if (json.mailboxId !== undefined || json.aliasId !== undefined) {
      if (existingSequence.sequenceMailbox) {
        // Update existing SequenceMailbox
        await prisma.sequenceMailbox.update({
          where: { id: existingSequence.sequenceMailbox.id },
          data: {
            ...(json.mailboxId && { mailboxId: json.mailboxId }),
            ...(json.aliasId !== undefined && { aliasId: json.aliasId }),
          },
        });
      } else if (json.mailboxId) {
        // Create new SequenceMailbox
        await prisma.sequenceMailbox.create({
          data: {
            sequenceId: id,
            mailboxId: json.mailboxId,
            aliasId: json.aliasId || null,
            userId: session.user.id,
          },
        });
      }
    }

    // Update sequence and return with all relations
    const sequence = await prisma.sequence.update({
      where: { id },
      data: updateData,
      include: {
        sequenceMailbox: true,
        businessHours: true,
      },
    });

    return NextResponse.json(sequence);
  } catch (error) {
    console.error("Error updating sequence settings:", error);
    return NextResponse.json(
      { error: "Failed to update sequence settings" },
      { status: 500 }
    );
  }
}
