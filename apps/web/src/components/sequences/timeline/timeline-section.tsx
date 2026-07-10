"use client";

import { useCallback } from "react";
import { TimelineHeader } from "./timeline-header";
import { TimelineList } from "./timeline-list";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query/keys";

interface TimelineSectionProps {
  userId: string;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  isInfiniteScroll: boolean;
  onScrollModeToggle?: () => void;
}

export function TimelineSection({
  userId,
  page,
  limit,
  onPageChange,
  onPageSizeChange,
  isInfiniteScroll,
  onScrollModeToggle,
}: TimelineSectionProps) {
  const queryClient = useQueryClient();

  const handleRefresh = useCallback(() => {
    // Broad invalidation across every timeline query for this user.
    queryClient.invalidateQueries({ queryKey: qk.timeline.all });
  }, [queryClient]);

  const handleExport = useCallback(async () => {
    // The export endpoint returns a CSV blob (not JSON), so it stays a direct
    // fetch — react-query is for cached data, not file downloads.
    const response = await fetch(`/api/timeline?userId=${userId}`, {
      method: "POST",
    });
    if (!response.ok) return;

    // Create a blob from the response
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "timeline.csv";
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, [userId]);

  return (
    <div className="space-y-6">
      <TimelineHeader
        sequence={{
          id: userId,
          name: "All Emails",
        }}
        isUserTimeline={true}
        onRefresh={handleRefresh}
        onExport={handleExport}
      />
      <TimelineList
        userId={userId}
        page={page}
        limit={limit}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        isInfiniteScroll={isInfiniteScroll}
        onScrollModeToggle={onScrollModeToggle}
      />
    </div>
  );
}
