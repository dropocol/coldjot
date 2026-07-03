import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "./auth";
import { prisma } from "@coldjot/database";

// Add paths that should be accessible without onboarding
// NOTE: /api/track is the email-open/click tracking endpoint and must be
// reachable by unauthenticated email clients (recipients).
const PUBLIC_PATHS = ["/", "/login", "/signup", "/api/auth", "/api/track"];
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

// Middleware needs the Node.js runtime because @coldjot/database now ships a
// Prisma `$extends` encrypt/decrypt hook (plan 02b) that imports Node's `crypto`
// at module top-level. `crypto` is unavailable in the Edge Runtime.
export const runtime = "nodejs";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
