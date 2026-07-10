"use client";

import { Loader2 } from "lucide-react";
import { TimelineRow } from "./timeline-row";
import { EmailDetailsDrawer } from "./email-details-drawer";
import { useState } from "react";
import { Button } from "@coldjot/ui/components/button";
import { Table, TableHeader, TableBody, TableHead, TableRow } from "@coldjot/ui/components/table";
import Link from "next/link";
import type { EmailTrackingRow } from "@coldjot/types";
import { useTimeline } from "@/hooks/queries/use-timeline";

interface RecentEmailsProps {
  userId: string;
}

export function RecentEmails({ userId }: RecentEmailsProps) {
  const [selectedEmail, setSelectedEmail] = useState<EmailTrackingRow | null>(null);

  const { data, isLoading, isError } = useTimeline({
    page: 1,
    limit: 20,
    userId,
  });
  const emails = (data?.emails ?? []) as unknown as EmailTrackingRow[];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-8 text-muted-foreground">Failed to load recent emails</div>
    );
  }

  if (emails.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">No recent emails found</div>;
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent Emails</h2>
          <Button variant="outline" nativeButton={false} render={<Link href="/timeline" />}>
            View All
          </Button>
        </div>

        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead className="hidden sm:table-cell">Recipient</TableHead>
                <TableHead className="hidden lg:table-cell">Sequence</TableHead>
                <TableHead className="hidden md:table-cell">Opens</TableHead>
                <TableHead className="hidden md:table-cell">Clicks</TableHead>
                <TableHead className="text-right">Sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emails.map((email) => (
                <TimelineRow
                  key={email.id}
                  email={email}
                  variant="global"
                  onSelect={() => setSelectedEmail(email)}
                  contextLabel={email.sequenceName}
                />
              ))}
            </TableBody>
          </Table>
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
