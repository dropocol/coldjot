import { Card } from "@/components/ui/card";
import {
  BarChart3,
  Mail,
  MousePointerClick,
  Reply,
  AlertTriangle,
  Users,
  Eye,
  ThumbsUp,
  Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SequenceStatsProps {
  stats: {
    totalEmails: number;
    sentEmails: number;
    openedEmails: number;
    uniqueOpens: number;
    clickedEmails: number;
    repliedEmails: number;
    bouncedEmails: number;
    unsubscribed: number;
    interested: number;
    peopleContacted: number;
    openRate: number;
    clickRate: number;
    replyRate: number;
    bounceRate: number;
  };
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: any;
  color: string;
  showProgress?: boolean;
  subValue?: string;
}

interface CustomProgressProps {
  value?: number;
  className?: string;
}

const CustomProgress = ({
  value = 0,
  className,
  ...props
}: CustomProgressProps) => {
  return (
    <div
      className={cn(
        "h-2 w-full bg-secondary overflow-hidden rounded-full",
        className
      )}
      {...props}
    >
      <div
        className="h-full bg-primary transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
};

/**
 * Format a rate value to a percentage string
 * Returns "0%" if the value is undefined, NaN, or the denominator is 0
 */
const formatRate = (numerator: number, denominator: number): string => {
  if (!denominator || numerator === undefined || isNaN(numerator)) return "0%";
  const rate = (numerator / denominator) * 100;
  return `${rate.toFixed(2)}%`;
};

/**
 * Calculate a rate as a percentage
 * Returns 0 if the denominator is 0 or either value is undefined
 */
const calculateRate = (numerator: number, denominator: number): number => {
  if (!denominator || numerator === undefined) return 0;
  return (numerator / denominator) * 100;
};

export const SequenceStats = ({ stats }: SequenceStatsProps) => {
  const statCards: StatCardProps[] = [
    {
      title: "Emails sent",
      value: stats.sentEmails || 0,
      icon: Mail,
      color: "text-blue-500",
      showProgress: false,
    },
    {
      title: "Total opens",
      value: stats.openedEmails || 0,
      // subValue: formatRate(stats.openedEmails, stats.sentEmails),
      icon: Eye,
      color: "text-green-500",
      showProgress: true,
    },
    {
      title: "Unique opens",
      value: stats.uniqueOpens || 0,
      // subValue: formatRate(stats.uniqueOpens, stats.sentEmails),
      icon: BarChart3,
      color: "text-emerald-500",
      showProgress: true,
    },
    {
      title: "Total people contacted",
      value: stats.peopleContacted || 0,
      icon: Users,
      color: "text-indigo-500",
      showProgress: false,
    },
    {
      title: "Contacts Replied",
      value: stats.repliedEmails || 0,
      subValue: formatRate(stats.repliedEmails, stats.peopleContacted),
      icon: Reply,
      color: "text-purple-500",
      showProgress: true,
    },
    {
      title: "Contacts Bounced",
      value: stats.bouncedEmails || 0,
      subValue: formatRate(stats.bouncedEmails, stats.peopleContacted),
      icon: AlertTriangle,
      color: "text-red-500",
      showProgress: true,
    },
    // {
    //   title: "Unsubscribed",
    //   value: stats.unsubscribed || 0,
    //   subValue: formatRate(stats.unsubscribed, stats.sentEmails),
    //   icon: Ban,
    //   color: "text-gray-500",
    //   showProgress: true,
    // },
    // {
    //   title: "Interested",
    //   value: stats.interested || 0,
    //   subValue: formatRate(stats.interested, stats.sentEmails),
    //   icon: ThumbsUp,
    //   color: "text-yellow-500",
    //   showProgress: true,
    // },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {statCards.map((stat) => (
        <Card key={stat.title} className="p-4 shadow-none">
          <div className="flex items-center justify-between mb-2">
            <stat.icon className={`w-5 h-5 ${stat.color}`} />
            <span className="text-sm text-muted-foreground">{stat.title}</span>
          </div>
          <div className="text-2xl font-semibold">{stat.value}</div>
          {stat.subValue && (
            <div className="text-sm text-muted-foreground mt-1">
              {stat.subValue}
            </div>
          )}
          {stat.showProgress && (
            <CustomProgress
              value={
                typeof stat.subValue === "string"
                  ? Number(stat.subValue.replace("%", ""))
                  : 0
              }
              className={cn("mt-2", stat.color.replace("text-", "bg-"))}
            />
          )}
        </Card>
      ))}
    </div>
  );
};
