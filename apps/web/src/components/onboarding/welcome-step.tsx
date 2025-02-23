import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Mail,
  Clock,
  Users,
  Zap,
  Sparkles,
  Target,
} from "lucide-react";

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  const features = [
    {
      icon: Mail,
      title: "Smart Email Sequences",
      description:
        "Create personalized email campaigns that adapt to recipient engagement",
      iconColor: "text-primary",
      colSpan: "col-span-12 md:col-span-4",
    },
    {
      icon: Clock,
      title: "Intelligent Scheduling",
      description:
        "Send emails at the perfect time based on your business hours",
      iconColor: "text-primary",
      colSpan: "col-span-12 md:col-span-4",
    },
    {
      icon: Target,
      title: "Advanced Targeting",
      description:
        "Segment your audience and create targeted campaigns for better results",
      iconColor: "text-primary",
      colSpan: "col-span-12 md:col-span-4",
    },
    {
      icon: Users,
      title: "Contact Management",
      description: "Organize contacts into lists and track engagement metrics",
      iconColor: "text-primary",
      colSpan: "col-span-12 md:col-span-4",
    },
    {
      icon: Sparkles,
      title: "AI-Powered Templates",
      description: "Create engaging email content with AI assistance",
      iconColor: "text-primary",
      colSpan: "col-span-12 md:col-span-4",
    },
    {
      icon: Zap,
      title: "Automation & Analytics",
      description: "Automate your outreach and get detailed insights",
      iconColor: "text-primary",
      colSpan: "col-span-12 md:col-span-4",
    },
  ];

  return (
    <div className="space-y-10">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center px-4 py-1.5 border border-primary/10 bg-primary/5 rounded-full">
          <span className="text-sm font-medium text-primary/80">
            Welcome to ColdJot
          </span>
        </div>
        <div className="space-y-2 max-w-2xl mx-auto">
          <h2 className="text-2xl font-semibold">
            The Future of Email Outreach
          </h2>
          <p className="text-muted-foreground">
            Create, manage, and optimize your email sequences for maximum
            engagement
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-12 gap-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className={`group col-span-1 flex flex-col rounded-xl border border-slate-200 p-1 shadow-sm ${feature.colSpan}`}
            >
              <div className="flex flex-1 flex-col justify-between gap-3 rounded-lg p-4 bg-gray-50 border border-slate-100">
                <div className="aspect-[4/1]">
                  <feature.icon className={`h-6 w-6 ${feature.iconColor}`} />
                </div>
                <div className="space-y-1">
                  <h3 className="font-medium text-gray-900">{feature.title}</h3>
                  <p className="text-sm text-gray-600">{feature.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-center pt-2">
        <Button onClick={onNext} size="lg">
          Get Started
          <ArrowRight className="ml-2 w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
