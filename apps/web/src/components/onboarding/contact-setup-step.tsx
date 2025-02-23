import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileSpreadsheet, Plus, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ContactSetupStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function ContactSetupStep({ onNext, onBack }: ContactSetupStepProps) {
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);

  const importMethods = [
    {
      id: "csv",
      name: "Import CSV",
      icon: FileSpreadsheet,
      description: "Upload your contacts from a CSV file (max 1,000 contacts)",
    },
    {
      id: "manual",
      name: "Add Manually",
      icon: Plus,
      description: "Create contacts one by one",
    },
  ];

  return (
    <div className="space-y-6">
      <Alert className="flex items-center gap-2 bg-yellow-500/10 border-yellow-500/20 text-yellow-700">
        <AlertDescription className="text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          CSV file can contain up to 1,000 contacts. Any additional contacts
          will be ignored to prevent system abuse.
        </AlertDescription>
      </Alert>

      <div className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Choose Import Method</Label>
            <div className="grid gap-4">
              {importMethods.map((method) => (
                <Card
                  key={method.id}
                  className="p-4 shadow-none hover:bg-accent cursor-pointer transition-colors"
                  onClick={() => setSelectedMethod(method.id)}
                >
                  <div className="flex items-center space-x-4">
                    <div className="p-2 rounded-full bg-primary/10">
                      <method.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium">{method.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {method.description}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {selectedMethod === "manual" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input placeholder="First Name" />
                <Input placeholder="Last Name" />
              </div>
              <Input type="email" placeholder="Email Address" />
            </div>
          )}

          {selectedMethod === "csv" && (
            <div className="space-y-2">
              <Input type="file" accept=".csv" className="cursor-pointer" />
              <p className="text-sm text-muted-foreground">
                Your CSV should include columns for: First Name, Last Name, and
                Email Address
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onNext}>
          I'll do this later
        </Button>
        <Button onClick={onNext}>Continue</Button>
      </div>
    </div>
  );
}
