import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { OnboardingContainer } from "@/components/onboarding/onboarding-container";

export const metadata = {
  title: "Onboarding - ColdJot",
  description: "Set up your ColdJot account and start sending email sequences",
};

export default async function OnboardingPage() {
  const session = await auth();

  // Redirect to login if not authenticated
  if (!session?.user) {
    redirect("/login");
  }

  // Redirect to dashboard if onboarding is completed
  if (session.user.onboardingCompleted) {
    redirect("/dashboard");
  }

  return <OnboardingContainer />;
}
