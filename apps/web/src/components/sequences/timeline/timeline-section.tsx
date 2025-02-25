"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { TimelineHeader } from "./timeline-header";
import { TimelineList } from "./timeline-list";
import { useQueryClient } from "@tanstack/react-query";

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
  const router = useRouter();
  const queryClient = useQueryClient();

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["timeline", undefined, userId],
    });
  }, [queryClient, userId]);

  const handleExport = useCallback(async () => {
    try {
      const response = await fetch(`/api/timeline?userId=${userId}`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to export timeline data");
      }

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
    } catch (error) {
      console.error("Failed to export timeline:", error);
    }
  }, [userId]);

  return (
    <div className="space-y-8 py-8">
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
