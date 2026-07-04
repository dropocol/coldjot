"use client";

import { GlobalSearch } from "./global-search";
import { useSession } from "next-auth/react";

export function Header() {
  const { data: session } = useSession();

  if (!session?.user) return null;

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center gap-4 px-4">
        <div className="flex-1" />
        <div className="flex w-full max-w-sm items-center justify-end space-x-2">
          <GlobalSearch />
        </div>
      </div>
    </header>
  );
}
