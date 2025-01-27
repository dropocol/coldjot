import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Mail, Users, FileText, Building2 } from "lucide-react";
import { StatsGrid } from "@/components/stats/stats-grid";
import { StatsChartSection } from "@/components/stats/stats-chart-section";
import { prisma } from "@/lib/prisma";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { StatsData, ChartData } from "@/types/stats";
import { type DateRange } from "@/components/stats/date-range-selector";
import { DateRangeSelectorWrapper } from "@/components/stats/date-range-selector-wrapper";
import {
  DEMO_STATS,
  generateDemoChartData,
} from "@/components/stats/demo-data";
import { startOfToday, startOfWeek, subDays } from "date-fns";

// Demo mode for development and preview
const DEMO_MODE = false;

function getDateRangeFilter(range: DateRange) {
  const now = new Date();
  switch (range) {
    case "today":
      return { gte: startOfToday() };
    case "this_week":
      return { gte: startOfWeek(now) };
    case "last_7_days":
      return { gte: subDays(now, 7) };
    case "last_30_days":
      return { gte: subDays(now, 30) };
    case "all_time":
    default:
      return {};
  }
}

async function getUserStats(
  userId: string,
  dateRange: DateRange
): Promise<StatsData> {
  if (DEMO_MODE) {
    return DEMO_STATS;
  }

  const dateFilter = getDateRangeFilter(dateRange);

  // First get all sequences for this user
  const sequences = await prisma.sequence.findMany({
    where: {
      userId,
    },
    select: {
      id: true,
    },
  });

  const sequenceIds = sequences.map((s) => s.id);

  // Then get stats for all these sequences
  const stats = await prisma.sequenceStats.aggregate({
    where: {
      sequenceId: {
        in: sequenceIds,
      },
      createdAt: dateFilter,
    },
    _sum: {
      totalEmails: true,
      sentEmails: true,
      openedEmails: true,
      uniqueOpens: true,
      clickedEmails: true,
      repliedEmails: true,
      bouncedEmails: true,
      unsubscribed: true,
      interested: true,
      peopleContacted: true,
    },
  });

  const sum = stats._sum ?? {
    totalEmails: 0,
    sentEmails: 0,
    openedEmails: 0,
    uniqueOpens: 0,
    clickedEmails: 0,
    repliedEmails: 0,
    bouncedEmails: 0,
    unsubscribed: 0,
    interested: 0,
    peopleContacted: 0,
  };

  const totalSent = sum.sentEmails ?? 0;
  const totalReplies = sum.repliedEmails ?? 0;
  const openedEmails = sum.openedEmails ?? 0;
  const bouncedEmails = sum.bouncedEmails ?? 0;

  return {
    totalEmails: sum.totalEmails ?? 0,
    sentEmails: totalSent,
    openedEmails: openedEmails,
    uniqueOpens: sum.uniqueOpens ?? 0,
    clickedEmails: sum.clickedEmails ?? 0,
    repliedEmails: totalReplies,
    bouncedEmails: bouncedEmails,
    unsubscribed: sum.unsubscribed ?? 0,
    interested: sum.interested ?? 0,
    peopleContacted: sum.peopleContacted ?? 0,
    openRate: totalSent > 0 ? (openedEmails / totalSent) * 100 : 0,
    replyRate: totalSent > 0 ? (totalReplies / totalSent) * 100 : 0,
    bounceRate: totalSent > 0 ? (bouncedEmails / totalSent) * 100 : 0,
  };
}

async function getUserChartData(
  userId: string,
  dateRange: DateRange
): Promise<ChartData[]> {
  if (DEMO_MODE) {
    const days =
      dateRange === "today"
        ? 1
        : dateRange === "this_week"
          ? 7
          : dateRange === "last_7_days"
            ? 7
            : dateRange === "last_30_days"
              ? 30
              : 30;
    return generateDemoChartData(days);
  }

  const dateFilter = getDateRangeFilter(dateRange);

  // First get all sequences for this user
  const sequences = await prisma.sequence.findMany({
    where: {
      userId,
    },
    select: {
      id: true,
    },
  });

  const sequenceIds = sequences.map((s) => s.id);

  const events = await prisma.emailEvent.findMany({
    where: {
      sequenceId: {
        in: sequenceIds,
      },
      timestamp: dateFilter,
    },
    orderBy: {
      timestamp: "asc",
    },
  });

  const dailyStats: Record<string, ChartData> = events.reduce(
    (acc, event) => {
      const date = event.timestamp.toISOString().split("T")[0];
      if (!acc[date]) {
        acc[date] = {
          date,
          sent: 0,
          opened: 0,
          replied: 0,
          uniqueOpens: 0,
        };
      }

      switch (event.type) {
        case "sent":
          acc[date].sent++;
          break;
        case "opened":
          acc[date].opened++;
          break;
        case "replied":
          acc[date].replied++;
          break;
        case "uniqueOpen":
          acc[date].uniqueOpens++;
          break;
      }

      return acc;
    },
    {} as Record<string, ChartData>
  );

  return Object.values(dailyStats);
}

function StatsLoadingCard() {
  return (
    <Card className="p-4 shadow-none">
      <div className="flex items-center justify-between mb-2">
        <Skeleton className="h-5 w-5 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="h-8 w-32 mt-2" />
      <Skeleton className="h-4 w-16 mt-1" />
      <Skeleton className="h-2 w-full mt-2 rounded-full" />
    </Card>
  );
}

function StatsLoadingGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <StatsLoadingCard key={i} />
      ))}
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ range?: DateRange }>;
}) {
  const session = await auth();

  if (!session) {
    redirect("/auth/signin");
  }

  const { range } = await searchParams;

  const dateRange = (range || "last_30_days") as DateRange;
  const stats = await getUserStats(session.user.id, dateRange);
  const chartData = await getUserChartData(session.user.id, dateRange);

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Welcome to ColdJot</h1>
          <p className="text-sm text-muted-foreground">
            Check your email stats and manage your email sequences.
          </p>
        </div>
        <DateRangeSelectorWrapper />
      </div>

      <Suspense fallback={<StatsLoadingGrid />}>
        <StatsGrid stats={stats} />
      </Suspense>

      <StatsChartSection data={chartData} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Link href="/sequences">
          <Button
            variant="outline"
            className="w-full h-32 flex flex-col items-center justify-center gap-2"
          >
            <Mail className="h-8 w-8" />
            <span>Email Sequences</span>
          </Button>
        </Link>

        <Link href="/contacts">
          <Button
            variant="outline"
            className="w-full h-32 flex flex-col items-center justify-center gap-2"
          >
            <Users className="h-8 w-8" />
            <span>Contacts</span>
          </Button>
        </Link>

        <Link href="/templates">
          <Button
            variant="outline"
            className="w-full h-32 flex flex-col items-center justify-center gap-2"
          >
            <FileText className="h-8 w-8" />
            <span>Templates</span>
          </Button>
        </Link>

        <Link href="/organizations">
          <Button
            variant="outline"
            className="w-full h-32 flex flex-col items-center justify-center gap-2"
          >
            <Building2 className="h-8 w-8" />
            <span>Organizations</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}
