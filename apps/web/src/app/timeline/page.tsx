"use client";

import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Separator } from "@coldjot/ui/components/separator";
import { TimelineSection } from "@/components/sequences/timeline/timeline-section";
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
    <main className="max-w-5xl mx-auto overflow-hidden py-8">
      <div className="relative">
        <div className="bg-background z-10">
          <PageHeader
            icon={CalendarDays}
            title="Timeline"
            description="View and manage your email campaign timeline."
          />
          <Separator className="mt-6" />
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
    </main>
  );
}
