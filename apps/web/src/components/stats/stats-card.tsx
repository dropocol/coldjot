import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  color: string;
  percentage?: number;
  trend?: "up" | "down";
  showProgress?: boolean;
  className?: string;
}

const CustomProgress = ({
  value = 0,
  className,
  ...props
}: {
  value?: number;
  className?: string;
}) => {
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

export function StatsCard({
  title,
  value,
  icon: Icon,
  color,
  percentage,
  trend,
  showProgress = false,
  className,
}: StatsCardProps) {
  return (
    <Card className={cn("p-4 shadow-none", className)}>
      <div className="flex items-center justify-between mb-2">
        <Icon className={cn("w-5 h-5", color)} />
        <span className="text-sm text-muted-foreground">{title}</span>
      </div>
      <div className="text-2xl font-semibold">{value.toLocaleString()}</div>
      {percentage !== undefined && (
        <div className="text-sm text-muted-foreground mt-1">
          {percentage.toFixed(2)}%
        </div>
      )}
      {showProgress && percentage !== undefined && (
        <CustomProgress
          value={percentage}
          className={cn("mt-2", color.replace("text-", "bg-"))}
        />
      )}
    </Card>
  );
}
