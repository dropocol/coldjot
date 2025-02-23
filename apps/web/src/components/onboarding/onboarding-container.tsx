"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { OnboardingLayout } from "./onboarding-layout";
import { WelcomeStep } from "./welcome-step";
import { EmailSetupStep } from "./email-setup-step";
import { BusinessHoursStep } from "./business-hours-step";
import { ContactSetupStep } from "./contact-setup-step";
import { FinalSetupStep } from "./final-setup-step";

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
  const [currentStep, setCurrentStep] = useState(0);
  const router = useRouter();

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    // Save onboarding state and redirect to dashboard
    router.push("/");
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

  return (
    <OnboardingLayout
      currentStep={currentStep + 1}
      totalSteps={STEPS.length}
      title={STEPS[currentStep].title}
      description={STEPS[currentStep].description}
    >
      {renderStep()}
    </OnboardingLayout>
  );
}
