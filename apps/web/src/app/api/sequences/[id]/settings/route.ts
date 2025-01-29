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
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const json: UpdateSettingsBody = await request.json();

  try {
    const updateData: any = {};
    const mailboxData: any = {};

    if (json.name !== undefined) updateData.name = json.name;
    if (json.accessLevel !== undefined)
      updateData.accessLevel = json.accessLevel;
    if (json.testMode !== undefined) updateData.testMode = json.testMode;
    if (json.disableSending !== undefined)
      updateData.disableSending = json.disableSending;
    if (json.scheduleType !== undefined)
      updateData.scheduleType = json.scheduleType;
    if (json.testEmails !== undefined) updateData.testEmails = json.testEmails;

    // Handle mailbox and alias updates
    if (json.mailboxId !== undefined || json.aliasId !== undefined) {
      const existingSequence = await prisma.sequence.findUnique({
        where: { id: id },
        include: { sequenceMailbox: true },
      });

      if (existingSequence?.sequenceMailbox) {
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

    // Update sequence
    const sequence = await prisma.sequence.update({
      where: {
        id: id,
      },
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
