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
    <main className="max-w-5xl mx-auto overflow-hidden py-8">
      <div className="relative">
        <div className="bg-background z-10">
          <PageHeader
            title="Timeline"
            description="View and manage your email campaign timeline."
          />
          <Separator className="mt-6" />
        </div>

        <TimelineSection userId={session.user.id} />
      </div>
    </main>
  );
}
