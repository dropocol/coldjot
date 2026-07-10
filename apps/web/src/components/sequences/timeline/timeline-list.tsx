"use client";

import { useState } from "react";
import { Loader2, ArrowUp, ArrowDown } from "lucide-react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { TimelineRow } from "./timeline-row";
import { EmailDetailsDrawer } from "./email-details-drawer";
import { PaginationControls } from "@/components/pagination";
import { useInView } from "react-intersection-observer";
import { Table, TableHeader, TableBody, TableHead, TableRow } from "@coldjot/ui/components/table";
import { cn } from "@coldjot/ui/lib/utils";
import type { EmailTrackingRow } from "@coldjot/types";
import { useTimeline, useInfiniteTimeline } from "@/hooks/queries/use-timeline";

interface TimelineListProps {
  sequenceId?: string;
  userId?: string;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  isInfiniteScroll: boolean;
  onScrollModeToggle?: () => void;
  /** "global" → 4th column shows sequence name; "sequence" → shows step label. */
  variant?: "global" | "sequence";
}

/** Keys that the API can sort by server-side. */
type SortKey = "sentAt" | "openCount" | "status";

/** Step column shows just the step number, e.g. "#2". */
function stepLabel(email: EmailTrackingRow): string {
  if (typeof email.stepOrder === "number") {
    return `#${email.stepOrder}`;
  }
  return "—";
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
  variant = "global",
}: TimelineListProps) {
  const [selectedEmail, setSelectedEmail] = useState<EmailTrackingRow | null>(null);
  const { ref, inView } = useInView();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeSort = (searchParams.get("sort") as SortKey | null) ?? "sentAt";
  const activeOrder = (searchParams.get("order") as "asc" | "desc" | null) ?? "desc";

  // Regular pagination query
  const paginationQuery = useTimeline({
    page,
    limit,
    sequenceId,
    userId,
  });

  // Infinite scroll query
  const infiniteQuery = useInfiniteTimeline({
    limit,
    sequenceId,
    userId,
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

  const toggleSort = (key: SortKey) => {
    const params = new URLSearchParams(searchParams.toString());
    const nextOrder = key === activeSort && activeOrder === "desc" ? "asc" : "desc";
    params.set("sort", key);
    params.set("order", nextOrder);
    router.push(`${pathname}?${params.toString()}`);
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
      <div className="text-center py-8 text-muted-foreground">Failed to load timeline data</div>
    );
  }

  const renderSortHead = (key: SortKey, label: string, align?: "right") => (
    <TableHead className={cn(align === "right" && "text-right")}>
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-muted-foreground transition-colors",
          align === "right" && "flex-row-reverse"
        )}
      >
        {label}
        {activeSort === key &&
          (activeOrder === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          ))}
      </button>
    </TableHead>
  );

  const renderTable = (emails: EmailTrackingRow[]) => {
    if (emails.length === 0) {
      return <div className="text-center py-8 text-muted-foreground">No emails found</div>;
    }

    return (
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              {renderSortHead("status", "Status")}
              <TableHead>Subject</TableHead>
              <TableHead className="hidden sm:table-cell">Recipient</TableHead>
              <TableHead className="hidden lg:table-cell">
                {variant === "sequence" ? "Step" : "Sequence"}
              </TableHead>
              {renderSortHead("openCount", "Opens")}
              <TableHead>Clicks</TableHead>
              {renderSortHead("sentAt", "Sent", "right")}
            </TableRow>
          </TableHeader>
          <TableBody>
            {emails.map((email) => (
              <TimelineRow
                key={email.id}
                email={email}
                variant={variant}
                onSelect={() => setSelectedEmail(email)}
                contextLabel={variant === "sequence" ? stepLabel(email) : email.sequenceName}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderEmails = () => {
    if (isInfiniteScroll) {
      const emails = (infiniteQuery.data?.pages.flatMap((p) => p.emails) ??
        []) as unknown as EmailTrackingRow[];
      return renderTable(emails);
    }

    const data = paginationQuery.data;
    const emails = (data?.emails ?? []) as unknown as EmailTrackingRow[];
    if (!data || emails.length === 0) {
      return <div className="text-center py-8 text-muted-foreground">No emails found</div>;
    }
    return renderTable(emails);
  };

  return (
    <>
      <div className="space-y-4">
        {renderEmails()}

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

      <EmailDetailsDrawer
        email={selectedEmail}
        isOpen={!!selectedEmail}
        onClose={() => setSelectedEmail(null)}
      />
    </>
  );
}
