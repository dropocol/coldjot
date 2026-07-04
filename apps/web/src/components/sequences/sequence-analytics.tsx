import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@coldjot/ui/components/card";
import { api } from "@/lib/http/api-client";
import { qk } from "@/lib/query/keys";

interface SequenceAnalytics {
  totalEmails: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
}

export function SequenceAnalytics({ sequenceId }: { sequenceId: string }) {
  const { data: analytics, isLoading } = useQuery({
    queryKey: qk.sequences.analytics(sequenceId),
    queryFn: () =>
      api.get<SequenceAnalytics>(`/api/sequences/${sequenceId}/analytics`),
  });

  if (isLoading) return <div>Loading analytics...</div>;
  if (!analytics) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Emails</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{analytics.totalEmails}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Open Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{analytics.openRate}%</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Reply Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{analytics.replyRate}%</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Bounce Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{analytics.bounceRate}%</div>
        </CardContent>
      </Card>
    </div>
  );
}
