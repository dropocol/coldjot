import { prisma } from "@coldjot/database";
import { notFound } from "next/navigation";
import { SequenceSettings } from "@/components/sequences/sequence-settings";
import type {
  BusinessHours,
  BusinessScheduleEnum,
  BusinessScheduleType,
} from "@coldjot/types";

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
      sequenceMailbox: {
        include: {
          mailbox: true,
          alias: true,
        },
      },
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
        scheduleType: sequence.scheduleType as BusinessScheduleType,
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
        sequenceMailbox: sequence.sequenceMailbox
          ? {
              id: sequence.sequenceMailbox.id,
              mailboxId: sequence.sequenceMailbox.mailboxId,
              aliasId: sequence.sequenceMailbox.aliasId,
            }
          : null,
      }}
    />
  );
}
