"use client";

import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { TimelineItem } from "./timeline-item";
import { EmailDetailsDrawer } from "./email-details-drawer";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { PaginationControls } from "@/components/pagination";
import { useInView } from "react-intersection-observer";
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedEmail, setSelectedEmail] = useState<EmailTracking | null>(
    null
  );
  const [isInfiniteScroll, setIsInfiniteScroll] = useState(false);
  const { ref, inView } = useInView();

  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const status = searchParams.get("status");
  const date = searchParams.get("date");

  const createQueryString = (params: Record<string, string | null>) => {
    const newSearchParams = new URLSearchParams(searchParams.toString());

    Object.entries(params).forEach(([key, value]) => {
      if (value === null) {
        newSearchParams.delete(key);
      } else {
        newSearchParams.set(key, value);
      }
    });

    return newSearchParams.toString();
  };

  const fetchTimelineData = async (
    pageParam = page
  ): Promise<TimelineResponse> => {
    const queryParams = new URLSearchParams();
    if (status && status !== "all") queryParams.set("status", status);
    if (date) queryParams.set("date", date);
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
    queryKey: ["timeline", sequenceId, userId, page, limit, status, date],
    queryFn: () => fetchTimelineData(page),
    enabled: !isInfiniteScroll,
  });

  // Infinite scroll query
  const infiniteQuery = useInfiniteQuery({
    queryKey: ["timeline-infinite", sequenceId, userId, limit, status, date],
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

  const handlePageChange = (newPage: number) => {
    router.push(
      `${pathname}?${createQueryString({
        page: newPage.toString(),
      })}`
    );
  };

  const handlePageSizeChange = (newLimit: number) => {
    router.push(
      `${pathname}?${createQueryString({
        page: "1",
        limit: newLimit.toString(),
      })}`
    );
  };

  const toggleScrollMode = () => {
    setIsInfiniteScroll((prev) => !prev);
  };

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
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
            isInfiniteScroll={isInfiniteScroll}
            onScrollModeToggle={toggleScrollMode}
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
