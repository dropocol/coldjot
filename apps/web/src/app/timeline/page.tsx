"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Separator } from "@/components/ui/separator";
import { TimelineSection } from "@/components/sequences/timeline/timeline-section";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";

export default function TimelinePage() {
  const { data: session, status } = useSession();

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
        </div>
        <Separator />
      </div>

      <TimelineSection userId={session.user.id} />
    </div>
  );
}
