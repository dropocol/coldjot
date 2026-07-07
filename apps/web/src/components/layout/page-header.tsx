import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
}

export const PageHeader = ({ title, description, action, icon: Icon }: PageHeaderProps) => {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="flex items-center gap-2.5">
          {Icon && <Icon className="size-[18px] text-muted-foreground" strokeWidth={2} />}
          <h1 className="text-2xl font-semibold">{title}</h1>
        </div>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
};
