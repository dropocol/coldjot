import { prisma } from "@coldjot/database";
import { notFound } from "next/navigation";
import { SequenceListsWrapper } from "./sequence-lists-wrapper";

export default async function SequenceListsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const sequence = await prisma.sequence.findUnique({
    where: {
      id: id,
    },
    select: {
      id: true,
    },
  });

  if (!sequence) {
    notFound();
  }

  return <SequenceListsWrapper sequenceId={sequence.id} />;
}
