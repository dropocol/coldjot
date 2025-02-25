"use client";

import { usePathname } from "next/navigation";
import { EnvironmentBanner } from "./environment-banner";
import Sidebar from "./Sidebar";
import type { Session } from "next-auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ONBOARDING_STEPS } from "@/lib/constants";

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

function LoadingSpinner() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
    </div>
  );
}

export function LayoutContent({ children, session }: LayoutContentProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const isPublic = isPublicPath(pathname);
  const showSidebar = !isPublic && !!session;

  const hasCompletedOnboarding = session?.user?.onboardingCompleted;
  const onboardingStep = session?.user?.onboardingStep ?? 0;
  const isOnboardingPath = pathname.startsWith("/onboarding");

  // Handle authentication and onboarding
  useEffect(() => {
    let mounted = true;

    const handleNavigation = async () => {
      try {
        if (!isPublic && !session) {
          await router.push(
            `/auth/signin?callbackUrl=${encodeURIComponent(pathname)}`
          );
        } else if (session && !hasCompletedOnboarding && !isOnboardingPath) {
          await router.push(
            `/onboarding/${ONBOARDING_STEPS[onboardingStep].id}`
          );
        } else {
          // Only set loading to false if no navigation is needed
          if (mounted) setIsLoading(false);
        }
      } catch (error) {
        console.error("Navigation error:", error);
        if (mounted) setIsLoading(false);
      }
    };

    handleNavigation();

    return () => {
      mounted = false;
    };
  }, [
    isPublic,
    session,
    router,
    pathname,
    hasCompletedOnboarding,
    onboardingStep,
    isOnboardingPath,
  ]);

  // Show loading spinner while in loading state
  if (isLoading) {
    return <LoadingSpinner />;
  }

  // Don't render anything if not authenticated on a protected route
  if (!isPublic && !session) {
    return null;
  }

  return (
    <div className="relative h-screen">
      {/* <EnvironmentBanner /> */}
      <div className="flex h-full">
        {showSidebar && hasCompletedOnboarding && (
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
