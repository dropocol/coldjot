"use client";

import { PageHeader } from "@/components/layout/page-header";
import { TimelineSection } from "@/components/sequences/timeline/timeline-section";
import { TimelineFilters } from "@/components/sequences/timeline/timeline-filters";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { usePagination } from "@/hooks/use-pagination";

export default function TimelinePage() {
  const { data: session, status } = useSession();
  const pagination = usePagination({ enableInfiniteScroll: true });

  if (status === "loading") {
    return null;
  }

  if (!session) {
    redirect("/auth/signin");
  }

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <PageHeader
            title="Timeline"
            description="View and manage your email campaign timeline."
          />
          <TimelineFilters />
        </div>
      </div>

      <TimelineSection
        userId={session.user.id}
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
