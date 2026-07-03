import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { NextResponse } from "next/server";


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
        startDate.setFullYear(2000); // Effectively get all data
        break;
    }

    // Get sequence contacts with their status
    const sequenceContacts = await prisma.sequenceContact.findMany({
      where: {
        sequenceId: id,
        updatedAt: {
          gte: startDate,
        },
      },
      include: {
        contact: true,
      },
    });

    // Get sequence steps with their status
    const steps = await prisma.sequenceStep.findMany({
      where: {
        sequenceId: id,
        updatedAt: {
          gte: startDate,
        },
      },
      orderBy: {
        order: "asc",
      },
    });

    // TODO: Fix it as we have removed status from sequence step
    // Calculate stats
    // const stats = {
    //   sent: steps.filter((step) => step.status === "sent").length,
    //   delivered: steps.filter((step) => step.status === "delivered").length,
    //   opened: steps.filter((step) => step.status === "opened").length,
    //   clicked: steps.filter((step) => step.status === "clicked").length,
    //   replied: steps.filter((step) => step.status === "replied").length,
    //   bounced: steps.filter((step) => step.status === "bounced").length,
    // };

    // Format activities
    const activities = steps.map((step) => ({
      id: step.id,
      contactName:
        sequenceContacts.find((sc) => sc.currentStep === step.order)?.contact
          .name || "Unknown",
      contactEmail:
        sequenceContacts.find((sc) => sc.currentStep === step.order)?.contact
          .email || "",
      subject: step.subject || "(No subject)",

      timestamp: step.updatedAt,
      stepNumber: step.order,
    }));

    return NextResponse.json({
      // stats,
      activities,
    });
  } catch (error) {
    console.error("Error fetching sequence stats:", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
