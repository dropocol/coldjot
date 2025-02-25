"use client";

import { cn } from "@/lib/utils";

const environmentConfig = {
  development: {
    label: "Development Environment",
    className:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  },
  staging: {
    label: "Staging Environment",
    className:
      "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  },
  production: {
    label: "Production Environment",
    className:
      "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
  },
};

export function EnvironmentBanner() {
  // Using APP_ENV from process.env, defaulting to 'development'
  const currentEnv = (process.env.NEXT_PUBLIC_APP_ENV ||
    "development") as keyof typeof environmentConfig;

  // Don't show banner in production
  if (currentEnv === "production") return null;

  const config = environmentConfig[currentEnv];

  if (!config) return null;

  return (
    <div
      className={cn(
        "sticky top-0 left-0 right-0 z-50 flex h-8 items-center justify-center border-b px-4 text-sm font-medium",
        config.className
      )}
    >
      {config.label}
    </div>
  );
}
