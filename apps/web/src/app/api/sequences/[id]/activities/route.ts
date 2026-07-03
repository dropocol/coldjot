import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@coldjot/database";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const timeframe = searchParams.get("timeframe") || "7d";

    // Calculate the date range based on timeframe
    const startDate = new Date();
    switch (timeframe) {
      case "24h":
        startDate.setHours(startDate.getHours() - 24);
        break;
      case "7d":
        startDate.setDate(startDate.getDate() - 7);
        break;
      case "30d":
        startDate.setDate(startDate.getDate() - 30);
        break;
      case "all":
        startDate.setFullYear(2000);
        break;
    }

    // First, get the sequence with its steps to know total steps
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

    const totalSteps = sequence.steps.length;

    // Get sequence contacts with their contact info
    const sequenceContacts = await prisma.sequenceContact.findMany({
      where: {
        sequenceId: id,
        updatedAt: {
          gte: startDate,
        },
      },
      include: {
        contact: {},
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    // Get the latest email events for each contact in this sequence
    const emailEvents = await prisma.emailEvent.findMany({
      where: {
        sequenceId: id,
        contactId: {
          in: sequenceContacts.map((sc) => sc.contactId),
        },
      },
      orderBy: {
        timestamp: "desc",
      },
    });

    // Create a map of contactId to their latest email event
    const latestEventsByContact = emailEvents.reduce((acc, event) => {
      if (
        !acc.has(event.contactId!) ||
        acc.get(event.contactId!)!.timestamp < event.timestamp
      ) {
        acc.set(event.contactId!, event);
      }
      return acc;
    }, new Map<string, (typeof emailEvents)[0]>());

    // Format activities
    const activities = sequenceContacts.map((sc) => {
      const currentStep = sequence.steps[sc.currentStep];
      const latestEvent = latestEventsByContact.get(sc.contactId);

      // Determine status based on latest event and sequence contact status
      let status: "not_started" | "in_progress" | "completed" | "failed";

      if (latestEvent) {
        switch (latestEvent.type.toLowerCase()) {
          case "sent":
            status = "completed";
            break;
          case "bounced":
          case "failed":
            status = "failed";
            break;
          case "sending":
            status = "in_progress";
            break;
          default:
            status = "not_started";
        }
      } else {
        // Fallback to sequence contact status
        status = sc.status === "not_sent" ? "not_started" : "in_progress";
      }

      return {
        id: sc.id,
        contactName: sc.contact.name,
        contactEmail: sc.contact.email,
        subject: currentStep?.subject || "(No subject)",
        status,
        timestamp: sc.updatedAt,
        stepNumber: sc.currentStep + 1,
        totalSteps,
        stepName:
          currentStep?.stepType === "manual_email"
            ? "Manual Email"
            : currentStep?.subject || "Email",
      };
    });

    return NextResponse.json(activities);
  } catch (error) {
    console.error("Error fetching sequence activities:", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
