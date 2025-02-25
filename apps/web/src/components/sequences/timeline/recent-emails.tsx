"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { TimelineItem } from "./timeline-item";
import { EmailDetailsDrawer } from "./email-details-drawer";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { EmailTracking } from "@/types/email";

interface RecentEmailsProps {
  userId: string;
}

interface TimelineResponse {
  emails: EmailTracking[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  nextPage: number | undefined;
}

export function RecentEmails({ userId }: RecentEmailsProps) {
  const [selectedEmail, setSelectedEmail] = useState<EmailTracking | null>(
    null
  );

  const { data, isLoading, isError } = useQuery<TimelineResponse>({
    queryKey: ["recent-emails", userId],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      queryParams.set("page", "1");
      queryParams.set("limit", "20");
      queryParams.set("userId", userId);

      const response = await fetch(`/api/timeline?${queryParams.toString()}`);

      if (!response.ok) {
        throw new Error("Failed to fetch recent emails");
      }

      return response.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Failed to load recent emails
      </div>
    );
  }

  if (!data || data.emails.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No recent emails found
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent Emails</h2>
          <Button variant="outline" asChild>
            <Link href="/timeline">View All</Link>
          </Button>
        </div>

        {data.emails.map((email) => (
          <TimelineItem
            key={email.id}
            email={email}
            onSelect={() => setSelectedEmail(email)}
          />
        ))}
      </div>

      <EmailDetailsDrawer
        email={selectedEmail}
        isOpen={!!selectedEmail}
        onClose={() => setSelectedEmail(null)}
      />
    </>
  );
}
