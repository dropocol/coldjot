import { TimelinePageClient } from "@/components/sequences/timeline/timeline-page-client";

interface TimelinePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function TimelinePage({ params }: TimelinePageProps) {
  const { id } = await params;
  return <TimelinePageClient id={id} />;
}
