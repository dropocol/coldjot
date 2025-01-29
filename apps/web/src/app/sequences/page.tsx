import { auth } from "@/auth";
import { prisma } from "@coldjot/database";
import { SequencesPageClient } from "./sequences-page-client";
import { SequenceStatus } from "@coldjot/types";
// import { Separator } from "@/components/ui/separator";

export default async function SequencesPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const sequences = await prisma.sequence.findMany({
    where: {
      userId: session.user.id,
    },
    include: {
      steps: {
        orderBy: {
          order: "asc",
        },
      },
      contacts: {
        include: {
          contact: true,
        },
      },
      _count: {
        select: {
          contacts: true,
        },
      },
    },
  });

  // Transform the data to match the expected interface
  const transformedSequences = sequences.map((sequence) => ({
    ...sequence,
    status: sequence.status as SequenceStatus,
    contacts: sequence.contacts.map((sc) => sc.contact),
    _count: {
      ...sequence._count,
      contacts: sequence._count.contacts,
    },
  }));

  return <SequencesPageClient initialSequences={transformedSequences} />;
}
