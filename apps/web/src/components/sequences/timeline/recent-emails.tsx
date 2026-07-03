"use client";

import { Loader2 } from "lucide-react";
import { TimelineItem } from "./timeline-item";
import { EmailDetailsDrawer } from "./email-details-drawer";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { EmailTracking } from "@/types/email";
import { useTimeline } from "@/hooks/queries/use-timeline";

interface RecentEmailsProps {
  userId: string;
}

export function RecentEmails({ userId }: RecentEmailsProps) {
  const [selectedEmail, setSelectedEmail] = useState<EmailTracking | null>(
    null
  );

  const { data, isLoading, isError } = useTimeline({
    page: 1,
    limit: 20,
    userId,
  });
  const emails = (data?.emails ?? []) as unknown as EmailTracking[];

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

  if (emails.length === 0) {
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

        {emails.map((email) => (
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
