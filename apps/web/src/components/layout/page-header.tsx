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
      <div className="flex items-center gap-4">
        {Icon && (
          <div className="rounded-xl border border-border p-1 shadow-sm">
            <div className="flex items-center justify-center rounded-lg border border-border bg-muted/50 p-4">
              <Icon className="h-6 w-6 text-primary" strokeWidth={2} />
            </div>
          </div>
        )}
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {description && (
            <p className="text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
};
