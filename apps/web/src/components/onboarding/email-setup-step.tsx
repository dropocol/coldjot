import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mail, AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "react-hot-toast";
import { usePathname } from "next/navigation";

interface EmailSetupStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function EmailSetupStep({ onNext, onBack }: EmailSetupStepProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const pathname = usePathname();

  const emailProviders = [
    {
      id: "gmail",
      name: "Gmail",
      icon: "/images/gmail.svg",
      description: "Connect your Gmail or Google Workspace account",
    },
  ];

  const handleConnectGmail = async () => {
    try {
      setIsConnecting(true);
      const response = await fetch("/api/mailboxes/gmail/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ returnPath: pathname }),
      });

      if (!response.ok) {
        throw new Error("Failed to initiate Gmail connection");
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (error) {
      console.error("Gmail connection error:", error);
      toast.error("Failed to connect Gmail account");
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Alert className="flex items-center gap-2 bg-yellow-500/10 border-yellow-500/20 text-yellow-700">
        <AlertDescription className="text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          Your credentials are securely stored and we only request the minimum
          required permissions.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4">
        {emailProviders.map((provider) => (
          <Card
            key={provider.id}
            className="p-6 hover:bg-accent cursor-pointer transition-colors shadow-none"
            onClick={handleConnectGmail}
          >
            <div className="flex items-center space-x-4">
              <div className="h-12 w-12 rounded-full bg-background p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={provider.icon}
                  alt={provider.name}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{provider.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {provider.description}
                </p>
              </div>
              {isConnecting ? (
                <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
              ) : (
                <Mail className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
          </Card>
        ))}
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
