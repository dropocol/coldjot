"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { OnboardingLayout } from "./onboarding-layout";
import { WelcomeStep } from "./welcome-step";
import { EmailSetupStep } from "./email-setup-step";
import { BusinessHoursStep } from "./business-hours-step";
import { ContactSetupStep } from "./contact-setup-step";
import { FinalSetupStep } from "./final-setup-step";
import {
  updateOnboardingStep,
  completeOnboarding,
} from "@/app/actions/onboarding";
import { toast } from "react-hot-toast";

const STEPS = [
  {
    id: "welcome",
    title: "Welcome to ColdJot",
    description: "Let's get you set up with everything you need",
  },
  {
    id: "email",
    title: "Connect Your Email",
    description: "Set up your email account to start sending sequences",
  },
  {
    id: "business-hours",
    title: "Business Hours",
    description: "Configure when your emails should be sent",
  },
  {
    id: "contacts",
    title: "Contact Management",
    description: "Import or create your first contact list",
  },
  {
    id: "final",
    title: "Complete Setup",
    description: "Review your setup and start using ColdJot",
  },
];

export function OnboardingContainer() {
  const { data: session } = useSession();
  const [currentStep, setCurrentStep] = useState(0);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Initialize with the step from session
    if (session?.user?.onboardingStep) {
      setCurrentStep(session.user.onboardingStep);
    }
  }, [session]);

  // Handle success/error states from Gmail connection
  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    const reason = searchParams.get("reason");

    if (success === "gmail_connected") {
      toast.success("Gmail account connected successfully", {
        duration: 2000, // Show for 2 seconds
      });

      // Wait for toast to be shown before moving to next step
      setTimeout(() => {
        handleNext();
      }, 5000);
    } else if (error) {
      toast.error(`Failed to connect Gmail account: ${reason || error}`, {
        duration: 3000, // Show error for longer
      });
    }
  }, [searchParams]);

  // Redirect to dashboard if onboarding is already completed
  useEffect(() => {
    if (session?.user?.onboardingCompleted) {
      router.replace("/dashboard");
    }
  }, [session, router]);

  const handleNext = async () => {
    if (currentStep < STEPS.length - 1) {
      const nextStep = currentStep + 1;
      await updateOnboardingStep(nextStep);
      setCurrentStep(nextStep);
    }
  };

  const handleBack = async () => {
    if (currentStep > 0) {
      const prevStep = currentStep - 1;
      await updateOnboardingStep(prevStep);
      setCurrentStep(prevStep);
    }
  };

  const handleComplete = async () => {
    await completeOnboarding();
    router.push("/dashboard");
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <WelcomeStep onNext={handleNext} />;
      case 1:
        return <EmailSetupStep onNext={handleNext} onBack={handleBack} />;
      case 2:
        return <BusinessHoursStep onNext={handleNext} onBack={handleBack} />;
      case 3:
        return <ContactSetupStep onNext={handleNext} onBack={handleBack} />;
      case 4:
        return (
          <FinalSetupStep onComplete={handleComplete} onBack={handleBack} />
        );
      default:
        return null;
    }
  };

  // Show loading state while session is loading
  if (!session) {
    return <div>Loading...</div>;
  }

  return (
    <>
      <OnboardingLayout
        currentStep={currentStep + 1}
        totalSteps={STEPS.length}
        title={STEPS[currentStep].title}
        description={STEPS[currentStep].description}
      >
        {renderStep()}
      </OnboardingLayout>
    </>
  );
}
