import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "./auth";
import { prisma } from "@coldjot/database";

// Add paths that should be accessible without onboarding
const PUBLIC_PATHS = ["/", "/login", "/signup", "/api/auth"];
const ONBOARDING_PATH = "/onboarding";

export async function middleware(request: NextRequest) {
  const session = await auth();

  // Allow public paths
  if (PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Redirect to login if not authenticated
  if (!session?.user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Get user's onboarding status
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { onboardingCompleted: true },
  });

  // If onboarding is not completed and user is not on onboarding page
  if (
    !user?.onboardingCompleted &&
    !request.nextUrl.pathname.startsWith(ONBOARDING_PATH)
  ) {
    return NextResponse.redirect(new URL(ONBOARDING_PATH, request.url));
  }

  // If onboarding is completed and user tries to access onboarding page
  if (
    user?.onboardingCompleted &&
    request.nextUrl.pathname.startsWith(ONBOARDING_PATH)
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
