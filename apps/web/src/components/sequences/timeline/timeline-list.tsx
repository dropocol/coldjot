"use client";

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useInView } from "react-intersection-observer";
import { Loader2 } from "lucide-react";
import { TimelineItem } from "./timeline-item";
import { EmailDetailsDrawer } from "./email-details-drawer";
import { useSearchParams } from "next/navigation";
import type { EmailTracking } from "@/types/email";

interface TimelineListProps {
  sequenceId?: string;
  userId?: string;
}

interface TimelineResponse {
  emails: EmailTracking[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  nextPage: number | undefined;
}

export function TimelineList({ sequenceId, userId }: TimelineListProps) {
  const searchParams = useSearchParams();
  const [selectedEmail, setSelectedEmail] = useState<EmailTracking | null>(
    null
  );
  const { ref, inView } = useInView();

  const fetchTimelineData = async (context: {
    pageParam: number;
  }): Promise<TimelineResponse> => {
    const status = searchParams.get("status");
    const date = searchParams.get("date");

    const queryParams = new URLSearchParams();
    if (status && status !== "all") queryParams.set("status", status);
    if (date) queryParams.set("date", date);
    queryParams.set("page", context.pageParam.toString());
    queryParams.set("limit", "20");
    if (userId) queryParams.set("userId", userId);

    const endpoint = sequenceId
      ? `/api/sequences/${sequenceId}/timeline`
      : `/api/timeline`;

    const response = await fetch(`${endpoint}?${queryParams.toString()}`);

    if (!response.ok) {
      throw new Error("Failed to fetch timeline data");
    }

    return response.json();
  };

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, status } =
    useInfiniteQuery({
      queryKey: ["timeline", sequenceId, userId, searchParams.toString()],
      queryFn: fetchTimelineData,
      initialPageParam: 1,
      getNextPageParam: (lastPage: TimelineResponse) =>
        lastPage.hasMore ? lastPage.nextPage : undefined,
    });

  // Load more when scrolling to the bottom
  if (inView && hasNextPage && !isFetchingNextPage) {
    fetchNextPage();
  }

  if (status === "pending") {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Failed to load timeline data
      </div>
    );
  }

  const emails = data?.pages.flatMap((page) => page.emails) ?? [];

  if (emails.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No emails found
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {emails.map((email) => (
          <TimelineItem
            key={email.id}
            email={email}
            onSelect={() => setSelectedEmail(email)}
          />
        ))}

        {/* Load more trigger */}
        <div ref={ref} className="h-8 flex items-center justify-center">
          {isFetchingNextPage && <Loader2 className="h-6 w-6 animate-spin" />}
        </div>
      </div>

      <EmailDetailsDrawer
        email={selectedEmail}
        isOpen={!!selectedEmail}
        onClose={() => setSelectedEmail(null)}
      />
    </>
  );
}
