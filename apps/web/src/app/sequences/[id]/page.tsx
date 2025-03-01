import { prisma } from "@coldjot/database";
import { notFound } from "next/navigation";
import { SequenceOverview } from "@/components/sequences/sequence-overview";
import type {
  SequenceStats,
  SequenceStatus,
  StepType,
  StepStatus,
  StepPriority,
  StepTiming,
  BusinessHours,
} from "@coldjot/types";

export default async function SequencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const sequence = await prisma.sequence.findUnique({
    where: {
      id: id,
    },
    include: {
      steps: {
        orderBy: {
          order: "asc",
        },
      },
      businessHours: true,
    },
  });

  if (!sequence) {
    notFound();
  }

  // Cast the sequence to match the expected type
  const typedSequence = {
    id: sequence.id,
    name: sequence.name,
    status: sequence.status as SequenceStatus,
    accessLevel: sequence.accessLevel as "team" | "private",
    scheduleType: sequence.scheduleType as "business" | "custom",
    businessHours: sequence.businessHours
      ? ({
          timezone: sequence.businessHours.timezone,
          workDays: sequence.businessHours.workDays,
          workHoursStart: sequence.businessHours.workHoursStart,
          workHoursEnd: sequence.businessHours.workHoursEnd,
        } as BusinessHours)
      : undefined,
    steps: sequence.steps.map((step: any) => ({
      id: step.id,
      sequenceId: step.sequenceId,
      stepType: step.stepType as StepType,
      status: step.status as StepStatus,
      priority: step.priority as StepPriority,
      timing: step.timing as StepTiming,
      delayAmount: step.delayAmount ?? undefined,
      delayUnit: step.delayUnit ?? undefined,
      subject: step.subject ?? undefined,
      content: step.content ?? undefined,
      includeSignature: step.includeSignature,
      note: step.note ?? undefined,
      order: step.order,
      previousStepId: step.previousStepId ?? undefined,
      replyToThread: step.replyToThread ?? undefined,
      threadId: step.threadId ?? undefined,
      createdAt: step.createdAt,
      updatedAt: step.updatedAt,
      templateId: step.templateId ?? undefined,
    })),
    testMode: sequence.testMode,
    disableSending: sequence.disableSending,
  };

  // Get sequence stats
  const stats = await prisma.sequenceStats.findFirst({
    where: {
      AND: [
        { sequenceId: id },
        { contactId: null }, // Get the overall sequence stats, not contact-specific stats
      ],
    },
  });

  // Cast the stats to match the expected type
  const typedStats = stats
    ? ({
        id: stats.id,
        sequenceId: stats.sequenceId,
        totalEmails: stats.totalEmails!,
        sentEmails: stats.sentEmails!,
        openedEmails: stats.openedEmails!,
        uniqueOpens: stats.uniqueOpens!,
        clickedEmails: stats.clickedEmails!,
        repliedEmails: stats.repliedEmails!,
        bouncedEmails: stats.bouncedEmails!,
        failedEmails: stats.failedEmails ?? 0,
        unsubscribed: 0,
        interested: 0,
        peopleContacted: stats.peopleContacted!,
        openRate: stats.openedEmails! / stats.sentEmails!,
        clickRate: stats.clickedEmails! / stats.sentEmails!,
        replyRate: stats.repliedEmails! / stats.sentEmails!,
        bounceRate: stats.bouncedEmails! / stats.sentEmails!,
        avgResponseTime: stats.avgResponseTime,
        avgOpenTime: stats.avgOpenTime ?? null,
        avgClickTime: stats.avgClickTime ?? null,
        avgReplyTime: stats.avgReplyTime ?? null,
        createdAt: stats.createdAt,
        updatedAt: stats.updatedAt,
        contactId: stats.contactId,
      } satisfies SequenceStats)
    : null;

  return <SequenceOverview sequence={typedSequence} stats={typedStats} />;
}
