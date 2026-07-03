import { StatsCard } from "./stats-card";
import type { StatsData } from "@/types/stats";
import {
  BarChart3,
  Mail,
  Reply,
  AlertTriangle,
  Users,
  Eye,
} from "lucide-react";

interface StatsGridProps {
  stats: StatsData;
}

export function StatsGrid({ stats }: StatsGridProps) {
  const statCards = [
    {
      title: "Emails sent",
      value: stats.sentEmails,
      icon: Mail,
      color: "text-blue-500",
      showProgress: false,
    },
    {
      title: "Total opens",
      value: stats.openedEmails,
      icon: Eye,
      color: "text-green-500",
      percentage: stats.openRate,
      showProgress: true,
    },
    {
      title: "Unique opens",
      value: stats.uniqueOpens,
      icon: BarChart3,
      color: "text-emerald-500",
      percentage: stats.openRate,
      showProgress: true,
    },
    {
      title: "Total people contacted",
      value: stats.peopleContacted,
      icon: Users,
      color: "text-indigo-500",
      showProgress: false,
    },
    {
      title: "Contacts Replied",
      value: stats.repliedEmails,
      icon: Reply,
      color: "text-purple-500",
      percentage: stats.replyRate,
      showProgress: true,
    },
    {
      title: "Contacts Bounced",
      value: stats.bouncedEmails,
      icon: AlertTriangle,
      color: "text-red-500",
      percentage: stats.bounceRate,
      showProgress: true,
    },
    // {
    //   title: "Unsubscribed",
    //   value: stats.unsubscribed,
    //   icon: Ban,
    //   color: "text-gray-500",
    //   percentage: (stats.unsubscribed / (stats.sentEmails || 1)) * 100,
    //   showProgress: true,
    // },
    // {
    //   title: "Interested",
    //   value: stats.interested,
    //   icon: ThumbsUp,
    //   color: "text-yellow-500",
    //   percentage: (stats.interested / (stats.repliedEmails || 1)) * 100,
    //   showProgress: true,
    // },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {statCards.map((stat) => (
        <StatsCard
          key={stat.title}
          title={stat.title}
          value={stat.value}
          icon={stat.icon}
          color={stat.color}
          percentage={stat.percentage}
          showProgress={stat.showProgress}
        />
      ))}
    </div>
  );
}
