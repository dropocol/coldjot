import { auth } from "@/auth";
import { SequencesPageClient } from "./sequences-page-client";

export default async function SequencesPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  return <SequencesPageClient initialSequences={[]} />;
}
