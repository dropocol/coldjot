import { prisma } from "@coldjot/database";
import { notFound } from "next/navigation";
import { SequenceSettings } from "@/components/sequences/sequence-settings";
import type { BusinessHours } from "@coldjot/types";

export default async function SequenceSettingsPage({
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
      businessHours: true,
    },
  });

  if (!sequence) {
    notFound();
  }

  return (
    <SequenceSettings
      sequence={{
        id: sequence.id,
        name: sequence.name,
        accessLevel: sequence.accessLevel as "team" | "private",
        scheduleType: sequence.scheduleType as "business" | "custom",
        businessHours: sequence.businessHours
          ? ({
              timezone: sequence.businessHours.timezone,
              workDays: sequence.businessHours.workDays,
              workHoursStart: sequence.businessHours.workHoursStart,
              workHoursEnd: sequence.businessHours.workHoursEnd,
              holidays: sequence.businessHours.holidays,
            } as BusinessHours)
          : undefined,
        testMode: sequence.testMode,
        disableSending: sequence.disableSending ?? false,
        testEmails: sequence.testEmails ?? [],
        mailboxId: sequence.mailboxId,
      }}
    />
  );
}
