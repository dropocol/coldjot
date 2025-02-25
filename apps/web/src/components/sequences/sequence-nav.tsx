"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface SequenceNavProps {
  sequenceId: string;
}

export function SequenceNav({ sequenceId }: SequenceNavProps) {
  const pathname = usePathname();

  const tabs = [
    {
      name: "Overview",
      href: `/sequences/${sequenceId}`,
      active: pathname === `/sequences/${sequenceId}`,
    },
    {
      name: "Contacts",
      href: `/sequences/${sequenceId}/contacts`,
      active: pathname === `/sequences/${sequenceId}/contacts`,
    },
    {
      name: "Timeline",
      href: `/sequences/${sequenceId}/timeline`,
      active: pathname === `/sequences/${sequenceId}/timeline`,
    },
    {
      name: "Settings",
      href: `/sequences/${sequenceId}/settings`,
      active: pathname === `/sequences/${sequenceId}/settings`,
    },
  ];

  return (
    <nav className="flex space-x-4 border-b">
      {tabs.map((tab) => (
        <Link
          key={tab.name}
          href={tab.href}
          className={cn(
            "px-3 py-2 text-sm font-medium transition-colors hover:text-primary",
            tab.active
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground"
          )}
        >
          {tab.name}
        </Link>
      ))}
    </nav>
  );
}
