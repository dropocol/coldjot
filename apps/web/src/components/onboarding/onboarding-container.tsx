"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
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
import { ONBOARDING_STEPS } from "@/lib/constants";

export function OnboardingContainer() {
  const { data: session } = useSession();
  const [currentStep, setCurrentStep] = useState(
    session?.user?.onboardingStep ?? 0
  );
  const [hasConnectedEmail, setHasConnectedEmail] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Synchronize URL with current step
  useEffect(() => {
    if (!session?.user) return;

    const stepFromUrl = pathname.split("/").pop();
    const onboardingStep = session.user.onboardingStep ?? 0;
    const correctStepUrl = `/onboarding/${ONBOARDING_STEPS[onboardingStep].id}`;

    // Only redirect if we're on the wrong step
    if (pathname !== correctStepUrl) {
      router.replace(correctStepUrl);
    }

    setCurrentStep(onboardingStep);
  }, [pathname, session, router]);

  // Check for connected mailboxes
  useEffect(() => {
    const checkMailboxes = async () => {
      try {
        const response = await fetch("/api/mailboxes/count");
        if (response.ok) {
          const { count } = await response.json();
          setHasConnectedEmail(count > 0);
        }
      } catch (error) {
        console.error("Failed to fetch mailboxes:", error);
      }
    };

    if (session?.user?.id) {
      checkMailboxes();
    }
  }, [session]);

  // Handle success/error states from Gmail connection
  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    const reason = searchParams.get("reason");

    if (success === "gmail_connected") {
      toast.success("Gmail account connected successfully", {
        duration: 2000,
      });
      setHasConnectedEmail(true);
      // Wait for toast to be shown before moving to next step
      setTimeout(() => {
        handleNext();
      }, 2000);
    } else if (error) {
      toast.error(`Failed to connect Gmail account: ${reason || error}`, {
        duration: 3000,
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
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      const nextStep = currentStep + 1;
      await updateOnboardingStep(nextStep);
      setCurrentStep(nextStep);
      router.replace(`/onboarding/${ONBOARDING_STEPS[nextStep].id}`);
    }
  };

  const handleBack = async () => {
    if (currentStep > 0) {
      const prevStep = currentStep - 1;
      await updateOnboardingStep(prevStep);
      setCurrentStep(prevStep);
      router.replace(`/onboarding/${ONBOARDING_STEPS[prevStep].id}`);
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
        return (
          <EmailSetupStep
            onNext={handleNext}
            onBack={handleBack}
            hasConnectedEmail={hasConnectedEmail}
          />
        );
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
        totalSteps={ONBOARDING_STEPS.length}
        title={ONBOARDING_STEPS[currentStep].title}
        description={ONBOARDING_STEPS[currentStep].description}
      >
        {renderStep()}
      </OnboardingLayout>
    </>
  );
}
