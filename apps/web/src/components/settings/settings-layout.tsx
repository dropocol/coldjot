"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  {
    name: "Profile",
    href: "/settings/profile",
  },
  {
    name: "Mailboxes",
    href: "/settings/mailboxes",
  },
];

interface SettingsLayoutProps {
  children: React.ReactNode;
}

export function SettingsLayout({ children }: SettingsLayoutProps) {
  const pathname = usePathname();

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-10 pb-16">
      <div className="space-y-0.5">
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          Manage your account settings and preferences.
        </p>
      </div>
      <nav className="flex space-x-4 border-b">
        {tabs.map((tab) => (
          <Link
            key={tab.name}
            href={tab.href}
            className={cn(
              "px-3 py-2 text-sm font-medium transition-colors hover:text-primary",
              pathname === tab.href
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground"
            )}
          >
            {tab.name}
          </Link>
        ))}
      </nav>
      <div className="flex-1">{children}</div>
    </div>
  );
}
