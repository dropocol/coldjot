"use client";

import { notFound } from "next/navigation";
import { TimelineHeader } from "./timeline-header";
import { TimelineList } from "./timeline-list";
import { usePagination } from "@/hooks/use-pagination";
import { useSequenceDetail } from "@/hooks/queries/use-sequences";

interface TimelinePageClientProps {
  id: string;
}

export function TimelinePageClient({ id }: TimelinePageClientProps) {
  const pagination = usePagination({ enableInfiniteScroll: true });
  const { data: sequence, isError } = useSequenceDetail(id);

  if (isError) notFound();
  if (!sequence) return null;

  return (
    <div className="space-y-8">
      <TimelineHeader sequence={sequence} />

      <TimelineList
        sequenceId={id}
        variant="sequence"
        page={pagination.page}
        limit={pagination.limit}
        onPageChange={pagination.onPageChange}
        onPageSizeChange={pagination.onPageSizeChange}
        isInfiniteScroll={pagination.isInfiniteScroll}
        onScrollModeToggle={pagination.onScrollModeToggle}
      />
    </div>
  );
}
