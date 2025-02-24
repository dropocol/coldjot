import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Mail, Clock, Users, ArrowRight } from "lucide-react";

interface FinalSetupStepProps {
  onComplete: () => void;
  onBack: () => void;
}

export function FinalSetupStep({ onComplete, onBack }: FinalSetupStepProps) {
  const completedSteps = [
    {
      icon: Mail,
      title: "Email Account Connected",
      description: "Your email account is ready to send sequences",
    },
    {
      icon: Clock,
      title: "Business Hours Configured",
      description: "Emails will be sent during your working hours",
    },
    {
      icon: Users,
      title: "Contact List Created",
      description: "Your first contact list is ready to use",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4">
        {completedSteps.map((step) => (
          <Card key={step.title} className="p-4 shadow-none">
            <div className="flex items-center space-x-4">
              <div className="p-2 rounded-full bg-primary/10">
                <step.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <h3 className="font-medium">{step.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  {step.description}
                </p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-6 bg-neutral-50 border-primary/10 shadow-none">
        <div className="space-y-4">
          <h3 className="font-semibold">Next Steps</h3>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center space-x-2">
              <ArrowRight className="h-4 w-4" />
              <span>Create your email templates</span>
            </li>
            <li className="flex items-center space-x-2">
              <ArrowRight className="h-4 w-4" />
              <span>Create your first email sequence</span>
            </li>
            <li className="flex items-center space-x-2">
              <ArrowRight className="h-4 w-4" />
              <span>Import more contacts or create additional lists</span>
            </li>
          </ul>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onComplete} size="lg">
          Go to Dashboard
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
