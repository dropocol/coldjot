import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Users, FileSpreadsheet, Plus } from "lucide-react";

interface ContactSetupStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function ContactSetupStep({ onNext, onBack }: ContactSetupStepProps) {
  const importMethods = [
    {
      id: "csv",
      name: "Import CSV",
      icon: FileSpreadsheet,
      description: "Upload your contacts from a CSV file",
    },
    {
      id: "manual",
      name: "Add Manually",
      icon: Plus,
      description: "Create your first contact list manually",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Create Your First List</Label>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Input placeholder="List name (e.g., Prospects, Clients)" />
                <p className="text-sm text-muted-foreground">
                  Give your list a descriptive name to help organize your
                  contacts
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Import Contacts</Label>
            <div className="grid gap-4">
              {importMethods.map((method) => (
                <Card
                  key={method.id}
                  className="p-4 shadow-none hover:bg-accent cursor-pointer transition-colors"
                  onClick={() => {
                    // Handle import method selection
                    console.log(`Selected ${method.name}`);
                  }}
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

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Quick Add Contact</Label>
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <Input placeholder="First Name" />
                <Input placeholder="Last Name" />
              </div>
              <Input type="email" placeholder="Email Address" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext}>Continue</Button>
      </div>
    </div>
  );
}
