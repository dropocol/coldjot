"use client";

import { usePathname } from "next/navigation";
import { EnvironmentBanner } from "./environment-banner";
import Sidebar from "./Sidebar";
import type { Session } from "next-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Pages that are public (don't require authentication)
const publicPaths = [
  "/auth/signin",
  "/auth/signup",
  "/legal/terms",
  "/legal/privacy",
];

function isPublicPath(pathname: string) {
  return publicPaths.some((path) => pathname.startsWith(path));
}

interface LayoutContentProps {
  children: React.ReactNode;
  session: Session | null;
}

export function LayoutContent({ children, session }: LayoutContentProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = isPublicPath(pathname);
  const showSidebar = !isPublic && !!session;

  const hasCompletedOnboarding = session?.user?.onboardingCompleted;

  // Handle authentication
  useEffect(() => {
    if (!isPublic && !session) {
      router.push(`/auth/signin?callbackUrl=${encodeURIComponent(pathname)}`);
    }
  }, [isPublic, session, router, pathname]);

  // Show loading state while redirecting
  if (!isPublic && !session) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="relative h-screen">
      {/* <EnvironmentBanner /> */}
      <div className="flex h-full">
        {showSidebar && !hasCompletedOnboarding && (
          <div className="hidden w-auto shrink-0 md:block">
            <Sidebar />
          </div>
        )}
        <main
          className={`flex-1 overflow-y-auto ${!showSidebar ? "w-full" : ""}`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
