"use client";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { ArrowDownWideNarrow, Loader2, ListEnd } from "lucide-react";

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  isInfiniteScroll?: boolean;
  isLoading?: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onScrollModeToggle?: () => void;
  infiniteScrollRef?: (node?: Element | null) => void;
}

const PAGE_SIZE_OPTIONS = [5, 10, 20, 30, 50, 100];

export function PaginationControls({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  isLoading = false,
  hasNextPage = false,
  isFetchingNextPage = false,
  isInfiniteScroll = false,
  onPageChange,
  onPageSizeChange,
  onScrollModeToggle,
  infiniteScrollRef,
}: PaginationControlsProps) {
  // Calculate the actual total pages based on total items and page size
  const actualTotalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Calculate the range of pages to show
  const getPageRange = () => {
    const range: (number | string)[] = [];
    const showEllipsisStart = currentPage > 3;
    const showEllipsisEnd = currentPage < actualTotalPages - 2;

    if (actualTotalPages <= 7) {
      return Array.from({ length: actualTotalPages }, (_, i) => i + 1);
    }

    range.push(1);
    if (showEllipsisStart) {
      range.push("...");
    }

    const start = Math.max(2, currentPage - 1);
    const end = Math.min(actualTotalPages - 1, currentPage + 1);

    for (let i = start; i <= end; i++) {
      range.push(i);
    }

    if (showEllipsisEnd) {
      range.push("...");
    }
    if (actualTotalPages > 1) {
      range.push(actualTotalPages);
    }

    return range;
  };

  const pageRange = getPageRange();
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (isInfiniteScroll) {
    return (
      <div className="flex flex-row justify-between gap-4 border-t pt-4">
        <div
          ref={infiniteScrollRef}
          className="h-8 flex items-center justify-center"
        >
          {isFetchingNextPage ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : hasNextPage ? (
            <span className="text-sm text-muted-foreground">
              Scroll to load more
            </span>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ListEnd className="h-4 w-4" />
              <span>End of list</span>
            </div>
          )}
        </div>
        {onScrollModeToggle && (
          <div className="flex items-center justify-end">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onScrollModeToggle}
                    className="gap-2"
                  >
                    <ArrowDownWideNarrow className="h-4 w-4" />
                    Switch to Pagination
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Toggle between pagination and infinite scroll</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>
    );
  }

  // Don't show pagination if there's only one page or no items
  if (actualTotalPages <= 1) {
    return (
      <div className="flex items-center justify-between border-t pt-4">
        <div className="flex items-center gap-4">
          <div className="text-sm text-muted-foreground whitespace-nowrap">
            {totalItems === 0
              ? "No items"
              : // : `Showing ${totalItems} item${totalItems !== 1 ? "s" : ""}`}
                `Showing`}
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => onPageSizeChange(parseInt(value))}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={size.toString()}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              items per page
            </span>
          </div>
        </div>

        {onScrollModeToggle && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onScrollModeToggle}
                  className="gap-2"
                >
                  <ArrowDownWideNarrow className="h-4 w-4" />
                  Switch to Infinite Scroll
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Toggle between pagination and infinite scroll</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between border-t pt-4">
      <div className="flex items-center gap-4">
        <div className="text-sm text-muted-foreground whitespace-nowrap">
          Showing {startItem}-{endItem} of {totalItems} items
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={pageSize.toString()}
            onValueChange={(value) => onPageSizeChange(parseInt(value))}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={size.toString()}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            items per page
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Pagination className="ml-auto">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (currentPage > 1) onPageChange(currentPage - 1);
                }}
                className={
                  currentPage === 1 ? "pointer-events-none opacity-50" : ""
                }
              />
            </PaginationItem>

            {pageRange.map((page, i) => (
              <PaginationItem key={i}>
                {typeof page === "number" ? (
                  <PaginationLink
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      onPageChange(page);
                    }}
                    isActive={page === currentPage}
                  >
                    {page}
                  </PaginationLink>
                ) : (
                  <PaginationEllipsis />
                )}
              </PaginationItem>
            ))}

            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (currentPage < actualTotalPages)
                    onPageChange(currentPage + 1);
                }}
                className={
                  currentPage === actualTotalPages
                    ? "pointer-events-none opacity-50"
                    : ""
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>

        {onScrollModeToggle && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onScrollModeToggle}
                  className="gap-2"
                >
                  <ArrowDownWideNarrow className="h-4 w-4" />
                  Switch to Infinite Scroll
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Toggle between pagination and infinite scroll</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}
