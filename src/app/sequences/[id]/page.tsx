import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import SequencePageComp from "./sequence-page";

async function getSequence(sequenceId: string) {
  const sequence = await prisma.sequence.findUnique({
    where: {
      id: sequenceId,
    },
    include: {
      steps: {
        orderBy: {
          order: "asc",
        },
      },
      contacts: {
        include: {
          contact: {
            include: {
              company: true,
            },
          },
        },
      },
      _count: {
        select: {
          contacts: true,
        },
      },
    },
  });

  if (!sequence) {
    throw new Error("Sequence not found");
  }

  return sequence;
}

export default async function SequencePage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = await params;
  const sequence = await getSequence(id);
  return <SequencePageComp sequence={sequence} />;
}