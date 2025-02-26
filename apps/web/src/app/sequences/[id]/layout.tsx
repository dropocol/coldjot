import { prisma } from "@coldjot/database";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SequenceStatusBadge } from "@/components/sequences/sequence-status-badge";
import { SequenceControls } from "@/components/sequences/sequence-controls";
import { SequenceNav } from "@/components/sequences/sequence-nav";
import { SequenceStatus } from "@coldjot/types";
import { SequenceHeader } from "@/components/sequences/sequence-header";

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

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <SequenceHeader
        sequence={{
          id: sequence.id,
          name: sequence.name,
          status: sequence.status as SequenceStatus,
          contactCount: sequence._count.contacts,
        }}
      />

      <div className="mt-6">{children}</div>
    </div>
  );
}
