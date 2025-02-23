import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ONBOARDING_STEPS } from "@/lib/constants";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin");
  }

  // If onboarding is completed, redirect to dashboard
  if (session.user.onboardingCompleted) {
    redirect("/dashboard");
  }

  // Get the current step from the session, defaulting to 0 if not set
  const currentStep = session.user.onboardingStep ?? 0;

  console.log("Current step", currentStep);
  console.log("Session user", session.user);

  // Redirect to the current step
  redirect(`/onboarding/${ONBOARDING_STEPS[currentStep].id}`);
}
