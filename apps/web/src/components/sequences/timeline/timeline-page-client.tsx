"use client";

import { useState, useEffect } from "react";
import { notFound } from "next/navigation";
import { TimelineHeader } from "./timeline-header";
import { TimelineList } from "./timeline-list";
import { usePagination } from "@/hooks/use-pagination";
import type { Sequence } from "@coldjot/types";

interface TimelinePageClientProps {
  id: string;
}

export function TimelinePageClient({ id }: TimelinePageClientProps) {
  const pagination = usePagination({ enableInfiniteScroll: true });
  const [sequence, setSequence] = useState<Sequence | null>(null);

  useEffect(() => {
    async function fetchSequence() {
      const response = await fetch(`/api/sequences/${id}`);
      if (!response.ok) {
        notFound();
      }
      const data = await response.json();
      setSequence(data);
    }
    fetchSequence();
  }, [id]);

  if (!sequence) return null;

  return (
    <div className="space-y-8">
      <TimelineHeader sequence={sequence} />

      <TimelineList
        sequenceId={id}
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
