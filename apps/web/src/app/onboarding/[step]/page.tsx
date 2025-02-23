import { OnboardingContainer } from "@/components/onboarding/onboarding-container";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { VALID_ONBOARDING_STEPS, ONBOARDING_STEPS } from "@/lib/constants";

type OnboardingStep = (typeof ONBOARDING_STEPS)[number]["id"];

export default async function OnboardingStepPage({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin");
  }

  const { step } = await params;

  // Redirect to dashboard if onboarding is completed
  if (session.user.onboardingCompleted) {
    redirect("/dashboard");
  }

  // Redirect to appropriate step if step is invalid or doesn't match user's progress
  if (!VALID_ONBOARDING_STEPS.includes(step as OnboardingStep)) {
    const currentStep = session.user.onboardingStep ?? 0;
    redirect(`/onboarding/${ONBOARDING_STEPS[currentStep].id}`);
  }

  return <OnboardingContainer />;
}
