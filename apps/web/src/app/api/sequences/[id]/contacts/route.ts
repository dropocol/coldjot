import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { SequenceContactStatusEnum } from "@coldjot/types";
import { NextResponse } from "next/server";
import { updateSequenceReadinessField } from "@/lib/metadata-utils";
import { findOwnedContact, notFound } from "@/lib/auth/access";
import { parseBody } from "@/lib/http/validation";
import { addContactToSequenceSchema } from "@coldjot/types/schemas";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") ?? "1");
    const limit = parseInt(searchParams.get("limit") ?? "20");
    const skip = (page - 1) * limit;

    // Get the sequence with its steps
    const sequence = await prisma.sequence.findUnique({
      where: { id },
      include: {
        steps: {
          orderBy: {
            order: "asc",
          },
        },
      },
    });

    if (!sequence) {
      return new NextResponse("Sequence not found", { status: 404 });
    }

    const _totalSteps = sequence.steps.length;

    // Get total count (exclude soft-deleted contacts + removed enrollments so
    // totals match the list)
    const total = await prisma.sequenceContact.count({
      where: {
        sequenceId: id,
        sequence: {
          userId: session.user.id,
        },
        removedAt: null,
        contact: { deletedAt: null },
      },
    });

    // Get sequence contacts with their latest status and events with pagination.
    // Exclude soft-deleted contacts and removed enrollments — neither can send.
    const sequenceContacts = await prisma.sequenceContact.findMany({
      where: {
        sequenceId: id,
        sequence: {
          userId: session.user.id,
        },
        removedAt: null,
        contact: { deletedAt: null },
      },
      include: {
        contact: {},
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    });

    // Format contacts with their latest status and activity
    const enrichedContacts = sequenceContacts.map((contact) => {
      const _currentStep = sequence.steps[contact.currentStep];
      // const latestEvent = latestEventsByContact.get(contact.contactId);

      // Determine status based on contact record and latest event
      let status: SequenceContactStatusEnum;

      if (contact.status === SequenceContactStatusEnum.REPLIED) {
        status = SequenceContactStatusEnum.REPLIED;
      } else if (contact.status === SequenceContactStatusEnum.BOUNCED) {
        status = SequenceContactStatusEnum.BOUNCED;
      } else if (contact.completed) {
        status = SequenceContactStatusEnum.COMPLETED;
        // } else if (latestEvent?.type.toLowerCase() === "bounced") {
        //   status = SequenceContactStatusEnum.FAILED;
      } else if (contact.currentStep > 0) {
        status = SequenceContactStatusEnum.IN_PROGRESS;
      } else {
        status = SequenceContactStatusEnum.NOT_STARTED;
      }

      return {
        ...contact,
        status,
      };
    });

    return NextResponse.json({
      contacts: enrichedContacts,
      totalSteps: sequence.steps.length,
      total,
    });
  } catch (error) {
    console.error("[SEQUENCE_CONTACTS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await parseBody(req, addContactToSequenceSchema);
    if (!body.ok) return body.response;
    const { contactId } = body.data;
    const { id } = await params;

    const sequence = await prisma.sequence.findUnique({
      where: {
        id: id,
        userId: session.user.id,
      },
      select: {
        id: true,
        metadata: true,
        _count: {
          select: {
            contacts: true,
          },
        },
      },
    });

    if (!sequence) {
      return new NextResponse("Not found", { status: 404 });
    }

    // IDOR guard: verify the contact belongs to the caller before enrolling
    // it in the sequence. Without this, a user could enroll another tenant's
    // contact by passing an arbitrary contactId.
    const ownsContact = await findOwnedContact(session.user.id, contactId, {
      id: true,
    });
    if (!ownsContact) {
      return notFound("Contact not found");
    }

    // Only an ACTIVE enrollment counts as "already in sequence" — a removed
    // (tombstoned) row should not block a manual re-add.
    const existingContact = await prisma.sequenceContact.findFirst({
      where: {
        sequenceId: id,
        contactId,
        removedAt: null,
      },
    });

    if (existingContact) {
      return NextResponse.json(
        { error: true, message: "Contact already in sequence" },
        { status: 409 }
      );
    }

    // Upsert so a previously-removed contact can be re-added manually. The
    // tombstone row already occupies the (sequenceId, contactId) unique key, so
    // a plain create would throw P2025. source = "direct" (sub-plan 04 covers
    // list-sourced re-add).
    const sequenceContact = await prisma.sequenceContact.upsert({
      where: {
        sequenceId_contactId: {
          sequenceId: id,
          contactId,
        },
      },
      create: {
        sequenceId: id,
        contactId,
        status: SequenceContactStatusEnum.NOT_STARTED,
        currentStep: 0,
        source: "direct",
        sourceListId: null,
      },
      update: {
        // resurrect a tombstone: clear removal + reset send-state
        removedAt: null,
        status: SequenceContactStatusEnum.NOT_STARTED,
        currentStep: 0,
        completed: false,
        nextScheduledAt: null,
        failureCount: 0,
        lastError: null,
        source: "direct",
        sourceListId: null,
      },
      include: {
        contact: {},
        sequence: {
          include: {
            steps: {
              orderBy: {
                order: "asc",
              },
            },
          },
        },
      },
    });

    // Update the sequence metadata only if this is the first contact
    // or if the metadata doesn't already indicate that contacts exist
    const metadataObj =
      (sequence.metadata as Record<string, unknown> | null) ?? {};
    const readiness =
      (metadataObj.readiness as Record<string, unknown> | undefined) ?? {};

    if (sequence._count.contacts === 0 || !readiness.hasContacts) {
      await updateSequenceReadinessField(id, "hasContacts", true);
    }

    // Return the contact with the same enriched format as GET
    const enrichedContact = {
      ...sequenceContact,
      status: SequenceContactStatusEnum.NOT_STARTED,
      currentStepName: sequenceContact.sequence.steps[0]?.subject || "Email",
      totalSteps: sequenceContact.sequence.steps.length,
      latestEvent: null,
    };

    return NextResponse.json(enrichedContact);
  } catch (error) {
    console.error("[SEQUENCE_CONTACTS_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
