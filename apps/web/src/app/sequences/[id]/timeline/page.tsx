import { prisma } from "@coldjot/database";
import { notFound } from "next/navigation";
import { TimelineHeader } from "@/components/sequences/timeline/timeline-header";
import { TimelineList } from "@/components/sequences/timeline/timeline-list";
import { TimelineFilters } from "@/components/sequences/timeline/timeline-filters";
import type { Sequence } from "@coldjot/types";

interface TimelinePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function TimelinePage({ params }: TimelinePageProps) {
  const { id } = await params;
  const sequence = await prisma.sequence.findUnique({
    where: { id: id },
    include: {
      EmailList: {
        select: {
          id: true,
          name: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!sequence) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <TimelineHeader sequence={sequence} />
      <TimelineList sequenceId={id} />
    </div>
  );
}
