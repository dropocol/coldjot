"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/http/api-client";
import { qk, type ListParams } from "@/lib/query/keys";

export interface TimelineEmail {
  id: string;
  [key: string]: unknown;
}

/** Response shape of GET /api/timeline and /api/sequences/[id]/timeline. */
export interface TimelineResponse {
  emails: TimelineEmail[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  nextPage?: number;
}

interface TimelineQueryParams extends ListParams {
  sequenceId?: string;
  userId?: string;
}

/** Same as above but without `page` (used by the infinite variant). */
type TimelineQueryNoPage = Omit<TimelineQueryParams, "page">;

function timelinePath(params: TimelineQueryNoPage): string {
  return params.sequenceId
    ? `/api/sequences/${params.sequenceId}/timeline`
    : "/api/timeline";
}

function timelineQs(params: TimelineQueryNoPage, page: number): string {
  const qs = new URLSearchParams();
  qs.set("page", String(page));
  qs.set("limit", String(params.limit));
  if (params.userId) qs.set("userId", params.userId);
  if (params.search) qs.set("q", params.search);
  return qs.toString();
}

/** Paginated timeline (page-by-page). */
export function useTimeline(params: TimelineQueryParams) {
  // Strip `page` for the path/query-string helpers (it's a separate arg).
  const { page, ...rest } = params;
  return useQuery({
    queryKey: qk.timeline.list(params),
    queryFn: () =>
      api.get<TimelineResponse>(
        `${timelinePath(rest)}?${timelineQs(rest, page)}`
      ),
  });
}

/** Infinite-scroll timeline. Returns pages on demand via `fetchNextPage`. */
export function useInfiniteTimeline(
  params: Omit<TimelineQueryParams, "page">
) {
  return useInfiniteQuery({
    queryKey: qk.timeline.infinite(params),
    queryFn: ({ pageParam }) =>
      api.get<TimelineResponse>(
        `${timelinePath(params)}?${timelineQs(params, pageParam)}`
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextPage : undefined,
  });
}
