"use client";

import { useState } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { TimelineItem } from "./timeline-item";
import { EmailDetailsDrawer } from "./email-details-drawer";
import { PaginationControls } from "@/components/pagination";
import { useInView } from "react-intersection-observer";
import type { EmailTracking } from "@/types/email";

interface TimelineListProps {
  sequenceId?: string;
  userId?: string;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  isInfiniteScroll: boolean;
  onScrollModeToggle?: () => void;
}

interface TimelineResponse {
  emails: EmailTracking[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  nextPage: number | undefined;
}

export function TimelineList({
  sequenceId,
  userId,
  page,
  limit,
  onPageChange,
  onPageSizeChange,
  isInfiniteScroll,
  onScrollModeToggle,
}: TimelineListProps) {
  const [selectedEmail, setSelectedEmail] = useState<EmailTracking | null>(
    null
  );
  const { ref, inView } = useInView();

  const fetchTimelineData = async (
    pageParam = page
  ): Promise<TimelineResponse> => {
    const queryParams = new URLSearchParams();
    queryParams.set("page", pageParam.toString());
    queryParams.set("limit", limit.toString());
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

  // Regular pagination query
  const paginationQuery = useQuery<TimelineResponse>({
    queryKey: ["timeline", sequenceId, userId, page, limit],
    queryFn: () => fetchTimelineData(page),
    enabled: !isInfiniteScroll,
  });

  // Infinite scroll query
  const infiniteQuery = useInfiniteQuery({
    queryKey: ["timeline-infinite", sequenceId, userId, limit],
    queryFn: ({ pageParam = 1 }) => fetchTimelineData(pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextPage : undefined,
    enabled: isInfiniteScroll,
  });

  // Load more when scrolling to the bottom
  if (
    isInfiniteScroll &&
    inView &&
    infiniteQuery.hasNextPage &&
    !infiniteQuery.isFetchingNextPage
  ) {
    infiniteQuery.fetchNextPage();
  }

  if (
    (!isInfiniteScroll && paginationQuery.isLoading) ||
    (isInfiniteScroll && infiniteQuery.isLoading)
  ) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (
    (!isInfiniteScroll && paginationQuery.isError) ||
    (isInfiniteScroll && infiniteQuery.isError)
  ) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Failed to load timeline data
      </div>
    );
  }

  const renderEmails = () => {
    if (isInfiniteScroll) {
      const emails =
        infiniteQuery.data?.pages.flatMap((page) => page.emails) ?? [];
      if (emails.length === 0) {
        return (
          <div className="text-center py-8 text-muted-foreground">
            No emails found
          </div>
        );
      }

      return (
        <>
          {emails.map((email) => (
            <TimelineItem
              key={email.id}
              email={email}
              onSelect={() => setSelectedEmail(email)}
            />
          ))}
        </>
      );
    }

    const data = paginationQuery.data;
    if (!data || data.emails.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          No emails found
        </div>
      );
    }

    return data.emails.map((email) => (
      <TimelineItem
        key={email.id}
        email={email}
        onSelect={() => setSelectedEmail(email)}
      />
    ));
  };

  return (
    <>
      <div className="h-full flex flex-col space-y-12">
        <div className="flex-1 overflow-auto min-h-0">
          <div className="space-y-4">{renderEmails()}</div>
        </div>
        <div className="flex-none">
          <PaginationControls
            currentPage={page}
            totalPages={Math.ceil(
              (isInfiniteScroll
                ? infiniteQuery.data?.pages[0]?.total
                : paginationQuery.data?.total) ?? 0 / limit
            )}
            pageSize={limit}
            totalItems={
              isInfiniteScroll
                ? (infiniteQuery.data?.pages[0]?.total ?? 0)
                : (paginationQuery.data?.total ?? 0)
            }
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            isInfiniteScroll={isInfiniteScroll}
            onScrollModeToggle={onScrollModeToggle}
            isLoading={
              (!isInfiniteScroll && paginationQuery.isLoading) ||
              (isInfiniteScroll && infiniteQuery.isLoading)
            }
            hasNextPage={infiniteQuery.hasNextPage}
            isFetchingNextPage={infiniteQuery.isFetchingNextPage}
            infiniteScrollRef={isInfiniteScroll ? ref : undefined}
          />
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
