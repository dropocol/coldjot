import { ReactNode } from "react";
import { Progress } from "@/components/ui/progress";

interface OnboardingLayoutProps {
  children: ReactNode;
  currentStep: number;
  totalSteps: number;
  title: string;
  description: string;
}

export function OnboardingLayout({
  children,
  currentStep,
  totalSteps,
  title,
  description,
}: OnboardingLayoutProps) {
  const progress = (currentStep / totalSteps) * 100;

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-5xl mx-auto py-8">
        <div className="space-y-6">
          <div className="space-y-0">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-base text-muted-foreground max-w-3xl">
              {description}
            </p>
          </div>

          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-sm text-muted-foreground text-right">
              Step {currentStep} of {totalSteps}
            </p>
          </div>

          <div className="bg-background rounded-lg">{children}</div>
        </div>
      </div>
    </div>
  );
}
