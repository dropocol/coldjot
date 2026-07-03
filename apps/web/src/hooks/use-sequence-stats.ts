import { useState, useEffect, useCallback } from "react";
import type { Prisma } from "@prisma/client";

// `{}` here is the idiomatic Prisma "no includes/select" payload args shape.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type SequenceStats = Prisma.SequenceStatsGetPayload<{}>;

export function useSequenceStats(sequenceId: string) {
  const [stats, setStats] = useState<SequenceStats>({
    id: "",
    sequenceId: sequenceId,
    contactId: null,
    totalEmails: 0,
    sentEmails: 0,
    openedEmails: 0,
    uniqueOpens: 0,
    clickedEmails: 0,
    repliedEmails: 0,
    bouncedEmails: 0,
    failedEmails: 0,
    unsubscribed: 0,
    interested: 0,
    peopleContacted: 0,
    openRate: 0,
    clickRate: 0,
    replyRate: 0,
    bounceRate: 0,
    avgResponseTime: null,
    avgOpenTime: null,
    avgClickTime: null,
    avgReplyTime: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(`/api/sequences/${sequenceId}/stats`);
      if (!response.ok) {
        throw new Error(`Failed to fetch stats: ${response.statusText}`);
      }
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error("Error fetching sequence stats:", error);
      setError(
        error instanceof Error ? error : new Error("Failed to fetch stats")
      );
    } finally {
      setIsLoading(false);
    }
  }, [sequenceId]);

  useEffect(() => {
    if (sequenceId) {
      fetchStats();
    }
  }, [sequenceId, fetchStats]);

  return {
    stats,
    isLoading,
    error,
    refresh: fetchStats,
  };
}
