import { prisma } from "@coldjot/database";
import { notFound } from "next/navigation";

import { SequenceStatus, type Sequence } from "@coldjot/types";
import { SequenceHeader } from "@/components/sequences/sequence-header";
import { SequenceProvider } from "@/lib/sequence-context";
import { toPlain } from "@/lib/serialize";

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

  // Prepare the sequence object for the provider. The Prisma row satisfies the
  // runtime shape; we cast at this boundary because @coldjot/types uses enums
  // and optional fields (?:) where Prisma yields string literals and `| null`.
  // `toPlain` strips Prisma's non-enumerable / Symbol properties so the object
  // can cross the Server → Client component boundary.
  const typedSequence = toPlain({
    ...sequence,
    status: sequence.status as SequenceStatus,
    contactCount: sequence._count.contacts,
    contacts: [],
  }) as unknown as Sequence;

  return (
    <SequenceProvider initialSequence={typedSequence}>
      <div className="max-w-5xl mx-auto py-8 space-y-6">
        <SequenceHeader />
        <div className="mt-6">{children}</div>
      </div>
    </SequenceProvider>
  );
}
