import { prisma } from "@coldjot/database";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SequenceStatusBadge } from "@/components/sequences/sequence-status-badge";
import { SequenceControls } from "@/components/sequences/sequence-controls";
import { SequenceNav } from "@/components/sequences/sequence-nav";
import { SequenceStatus } from "@coldjot/types";
import { SequenceHeader } from "@/components/sequences/sequence-header";
import { SequenceProvider } from "@/lib/sequence-context";

export default async function SequenceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const sequence = await prisma.sequence.findUnique({
    where: {
      id: id,
    },
    include: {
      steps: true,
      businessHours: true,
      sequenceMailbox: true,
      _count: {
        select: {
          contacts: true,
        },
      },
    },
  });

  if (!sequence) {
    notFound();
  }

  // Prepare the sequence object with proper typing
  const typedSequence = {
    id: sequence.id,
    name: sequence.name,
    status: sequence.status as SequenceStatus,
    contactCount: sequence._count.contacts,
    steps: sequence.steps,
    businessHours: sequence.businessHours,
    sequenceMailbox: sequence.sequenceMailbox,
    metadata: sequence.metadata,
    _count: sequence._count,
    ...(sequence as any),
  };

  return (
    <SequenceProvider initialSequence={typedSequence}>
      <div className="max-w-5xl mx-auto py-8 space-y-6">
        <SequenceHeader />
        <div className="mt-6">{children}</div>
      </div>
    </SequenceProvider>
  );
}
